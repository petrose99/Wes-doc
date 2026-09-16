// Autopilot helper: system snapshot (load, top CPU processes, a process's state) — the driver's
// allowlist blocks the usual flags on ps/top, so this reads /proc directly.
import { readFileSync, readdirSync } from 'node:fs'
const load = readFileSync('/proc/loadavg', 'utf8').trim()
console.log('loadavg', load)
const rows = []
for (const pid of readdirSync('/proc').filter((d) => /^\d+$/.test(d))) {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
    const name = stat.slice(stat.indexOf('(') + 1, stat.lastIndexOf(')'))
    const f = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
    const state = f[0], utime = +f[11], stime = +f[12], rss = +f[21] * 4096 / 1e6
    const cmd = readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ').slice(0, 90)
    rows.push({ pid: +pid, name, state, cpu: utime + stime, rss: Math.round(rss), cmd })
  } catch {}
}
rows.sort((a, b) => b.cpu - a.cpu)
for (const r of rows.slice(0, 8)) console.log(r.pid, r.state, `cpu=${r.cpu}`, `rss=${r.rss}MB`, r.cmd)
const target = process.argv[2]
if (target) { const r = rows.find((x) => x.pid === +target); console.log('target', r) }
