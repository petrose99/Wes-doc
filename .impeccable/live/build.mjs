// Autopilot helper: `next build` with the .env loaded and a big heap; prints the tail and the payments routes.
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
const root = '/home/ubuntu/Dev/Wes-doc'
const env = { ...process.env, NODE_OPTIONS: '--max-old-space-size=8192' }
for (const line of readFileSync(`${root}/.env`, 'utf8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^"|"$/g, '') }
const r = spawnSync('npx', ['next', 'build'], { cwd: root, env, encoding: 'utf8', maxBuffer: 1e8 })
const out = (r.stdout || '') + (r.stderr || '')
const lines = out.split('\n')
console.log(lines.filter((l) => /admin|account|error|Error|✓|✗|Failed/.test(l)).slice(0, 60).join('\n'))
console.log(`\n[build exit ${r.status}; ${lines.length} lines]`)
