// Autopilot helper: `node .impeccable/live/dev.mjs migrate|seed <ws>|start|stop|status`
// (chained shell is blocked under the driver, so multi-step work lives here).
import { spawnSync, spawn } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, openSync } from 'node:fs'

const root = '/home/ubuntu/Dev/Wes-doc'
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
const pidFile = `${root}/.impeccable/live/dev-server.pid`

if (cmd === 'migrate') {
  process.exit(run('npx', ['prisma', 'migrate', 'deploy']))
} else if (cmd === 'seed') {
  process.exit(run('npx', ['tsx', '--env-file', '.env', 'scripts/dev/seed-po-mismatch.ts', process.argv[3]]))
} else if (cmd === 'seed-billpay') {
  process.exit(run('npx', ['tsx', '--env-file', '.env', 'scripts/dev/seed-bill-pay.ts', process.argv[3], ...(process.argv[4] ? [process.argv[4]] : [])]))
} else if (cmd === 'start') {
  const status = spawnSync('ss', ['-ltn'], { encoding: 'utf8' }).stdout
  if (/:3000\b/.test(status)) { console.log('already listening on :3000'); process.exit(0) }
  const out = openSync(`${root}/.impeccable/live/dev-server.log`, 'a')
  const child = spawn('npx', ['next', 'dev', '-p', '3000'], { cwd: root, env, detached: true, stdio: ['ignore', out, out] })
  writeFileSync(pidFile, String(child.pid))
  child.unref()
  console.log('started pid', child.pid)
} else if (cmd === 'stop') {
  if (existsSync(pidFile)) {
    const pid = Number(readFileSync(pidFile, 'utf8'))
    try { process.kill(-pid, 'SIGTERM'); console.log('stopped group', pid) } catch (e) { console.log('stop:', e.message) }
  }
} else if (cmd === 'status') {
  console.log(spawnSync('ss', ['-ltn'], { encoding: 'utf8' }).stdout.split('\n').filter((l) => /:(3000|8400|55433)\b/.test(l)).join('\n'))
} else if (cmd === 'log') {
  const log = readFileSync(`${root}/.impeccable/live/dev-server.log`, 'utf8').split('\n')
  console.log(log.slice(-Number(process.argv[3] || 40)).join('\n'))
}
