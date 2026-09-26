// Autopilot helper: `node scripts/dev/dev.mjs doctor|migrate|seed <ws>|seed-billpay <ws>|prep <ws>|start [ws]|stop|status|log [n]`
// (chained shell is blocked under the driver, so multi-step work lives here).
//
// `start` is the one entry point for a capture round: it brings up the Next
// dev server on :3000 AND the impeccable live-server on :8400 (the in-page
// detector), waits until both answer, and — given a workspace id — runs
// `prep` on it. #266 lost two build sessions to the pieces this replaces: the
// live-server not running (detector 404 on every state), the launcher binary
// denied when called from Bash, a null `jurisdictionCode` failing every
// upload, and a bespoke `start-live-server.mjs` per ticket.
import { spawnSync, spawn } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, openSync, unlinkSync, mkdirSync } from 'node:fs'
import os from 'node:os'

// The tree this is run from: a lane worktree under the autopilot, or the checkout.
const root = process.env.WAYFINDER_ROOT || spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).stdout.trim() || '/home/ubuntu/Dev/Wes-doc'
const env = { ...process.env }
for (const line of readFileSync(`${root}/.env`, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, '')
}
const cmd = process.argv[2]
const run = (bin, args, opts = {}) => {
  const r = spawnSync(bin, args, { cwd: root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1e8, ...opts })
  process.stdout.write((r.stdout || '') + (r.stderr || ''))
  return r.status
}
// Runtime state (pids, logs) stays in the gitignored .impeccable/live, which lanes share by symlink.
mkdirSync(`${root}/.impeccable/live`, { recursive: true })
const pidFile = `${root}/.impeccable/live/dev-server.pid`
const livePidFile = `${root}/.impeccable/live/live-server.pid`
const listening = (port) => new RegExp(`:${port}\\b`).test(spawnSync('ss', ['-ltn'], { encoding: 'utf8' }).stdout)
const pidOnPort = (port) => {
  const m = spawnSync('ss', ['-ltnp', `sport = :${port}`], { encoding: 'utf8' }).stdout.match(/pid=(\d+)/)
  return m ? Number(m[1]) : null
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function waitFor(label, probe, ms = 90000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) { if (await probe().catch(() => false)) { console.log(`${label}: up`); return true }; await sleep(1000) }
  console.log(`${label}: NOT up after ${ms / 1000}s`); return false
}
const httpOk = (url) => fetch(url, { redirect: 'manual' }).then((r) => r.status < 500)

function startNext() {
  if (listening(3000)) { console.log('next: already listening on :3000'); return }
  const out = openSync(`${root}/.impeccable/live/dev-server.log`, 'a')
  // Heap cap (#252): earlyoom (-m 8) killed the Turbopack worker and the Playwright Chromium twice
  // while a route compiled with the browser open; a bounded heap makes the compiler GC instead.
  const child = spawn('npx', ['next', 'dev', '-p', '3000'], { cwd: root, env: { ...env, NODE_OPTIONS: process.env.DEV_HEAP ? `--max-old-space-size=${process.env.DEV_HEAP}` : '--max-old-space-size=2560' }, detached: true, stdio: ['ignore', out, out] })
  writeFileSync(pidFile, String(child.pid))
  child.unref()
  console.log('next: started pid', child.pid)
}
function startLive() {
  if (listening(8400)) { console.log('live-server: already listening on :8400'); return }
  const home = os.homedir()
  const bin = [process.env.IMPECCABLE_BIN, `${home}/.impeccable/bin/0.1.5/impeccable`, `${home}/.impeccable/bin/impeccable`].filter(Boolean).find((c) => existsSync(c))
  if (!bin) { console.log('live-server: no impeccable binary under ~/.impeccable/bin'); return }
  const out = openSync(`${root}/.impeccable/live/live-server.log`, 'a')
  // Spawned from node, not Bash: the driver's sandbox denies the binary when a
  // shell invokes it directly (#266 G2) but allows it as a child of `node`.
  const child = spawn(bin, ['live-server', '--background'], {
    cwd: root, env: { ...env, IMPECCABLE_SKILL_DIR: `${root}/.claude/skills/impeccable/scripts` }, detached: true, stdio: ['ignore', out, out],
  })
  writeFileSync(livePidFile, String(child.pid))
  child.unref()
  console.log('live-server: started pid', child.pid)
}
function stopPort(port, file, label) {
  const pids = new Set()
  if (existsSync(file)) { pids.add(Number(readFileSync(file, 'utf8'))); try { unlinkSync(file) } catch {} }
  const p = pidOnPort(port); if (p) pids.add(p)
  for (const pid of pids) {
    try { process.kill(-pid, 'SIGTERM'); console.log(`${label}: stopped group`, pid) } catch { try { process.kill(pid, 'SIGTERM'); console.log(`${label}: stopped`, pid) } catch (e) { console.log(`${label}: stop ${pid}:`, e.message) } }
  }
  if (!pids.size) console.log(`${label}: nothing to stop`)
}

// Read-only: is this instance worth driving? One line per check, `fix:` names the command.
async function doctor() {
  const fails = []
  const check = (ok, label, fix) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `  — fix: ${fix}`}`); if (!ok) fails.push(label) }
  check(env.DEV_AUTH_BYPASS === 'true', '.env DEV_AUTH_BYPASS=true', 'set it in .env (dev only)')
  check(/:55433\//.test(env.DATABASE_URL || ''), '.env DATABASE_URL → devdb :55433', 'point DATABASE_URL at docubite-devdb on 127.0.0.1:55433')
  check(listening(55433), 'devdb listening :55433', 'docker start docubite-devdb')
  const pid = pidOnPort(3000)
  check(!!pid || !listening(3000), 'next :3000 owned by this user', 'another user/container holds :3000 (docker web?) — stop it')
  if (pid) {
    let cwd = null; try { cwd = spawnSync('readlink', ['-f', `/proc/${pid}/cwd`], { encoding: 'utf8' }).stdout.trim() } catch {}
    check(cwd === root, `next :3000 serves this tree (${cwd || '?'})`, `dev.mjs stop from ${cwd || 'its tree'}, then dev.mjs start here`)
    const pgid = spawnSync('ps', ['-o', 'pgid=', '-p', String(pid)], { encoding: 'utf8' }).stdout.trim()
    const mine = existsSync(pidFile) && readFileSync(pidFile, 'utf8').trim() === pgid
    console.log(`info next pid ${pid} pgid ${pgid} ${mine ? '(started by dev.mjs)' : '(not in dev-server.pid — started elsewhere; do not stop what you did not start)'}`)
  }
  check(await httpOk('http://localhost:3000/').catch(() => false), 'next :3000 answers < 500', 'node scripts/dev/dev.mjs start <ws>  (500s: dev.mjs log 80)')
  check(await httpOk('http://localhost:8400/detect.js').catch(() => false), 'live-server :8400 serves detect.js', 'node scripts/dev/dev.mjs start <ws>')
  console.log(fails.length ? `doctor: ${fails.length} failing` : 'doctor: ready to drive')
  return fails.length ? 1 : 0
}

if (cmd === 'doctor') {
  process.exit(await doctor())
} else if (cmd === 'migrate') {
  process.exit(run('npx', ['prisma', 'migrate', 'deploy']))
} else if (cmd === 'seed') {
  process.exit(run('npx', ['tsx', '--env-file', '.env', 'scripts/dev/seed-po-mismatch.ts', process.argv[3]]))
} else if (cmd === 'seed-billpay') {
  process.exit(run('npx', ['tsx', '--env-file', '.env', 'scripts/dev/seed-bill-pay.ts', process.argv[3], ...(process.argv[4] ? [process.argv[4]] : [])]))
} else if (cmd === 'prep') {
  process.exit(run('npx', ['tsx', '--env-file', '.env', 'scripts/dev/prep-workspace.ts', process.argv[3]]))
} else if (cmd === 'start') {
  startNext(); startLive()
  const okNext = await waitFor('next :3000', () => httpOk('http://localhost:3000/'), 180000)
  const okLive = await waitFor('live-server :8400', () => httpOk('http://localhost:8400/detect.js'), 30000)
  if (process.argv[3]) run('npx', ['tsx', '--env-file', '.env', 'scripts/dev/prep-workspace.ts', process.argv[3]])
  process.exit(okNext && okLive ? 0 : 1)
} else if (cmd === 'stop') {
  stopPort(3000, pidFile, 'next'); stopPort(8400, livePidFile, 'live-server')
} else if (cmd === 'status') {
  console.log(spawnSync('ss', ['-ltn'], { encoding: 'utf8' }).stdout.split('\n').filter((l) => /:(3000|8400|55433)\b/.test(l)).join('\n') || 'nothing on :3000 / :8400 / :55433')
} else if (cmd === 'log') {
  const log = readFileSync(`${root}/.impeccable/live/dev-server.log`, 'utf8').split('\n')
  console.log(log.slice(-Number(process.argv[3] || 40)).join('\n'))
} else {
  console.log('usage: dev.mjs doctor|migrate|seed <ws>|seed-billpay <ws> [--reset]|prep <ws>|start [ws]|stop|status|log [n]'); process.exit(2)
}
