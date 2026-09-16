// Autopilot helper (#252): copy the Playwright pass into the scratchpad (playwright resolves from
// there) and run it. `node .impeccable/live/verify252.mjs shots|detect|keys|all [verbose]`
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync } from 'node:fs'
const scratch = '/tmp/scratch229'
mkdirSync(scratch, { recursive: true })
copyFileSync('/home/ubuntu/Dev/Wes-doc/.impeccable/live/admin252.mjs', `${scratch}/admin252.mjs`)
const r = spawnSync('node', [`${scratch}/admin252.mjs`, ...process.argv.slice(2)], {
  cwd: scratch,
  env: { ...process.env },
  encoding: 'utf8', maxBuffer: 1e8,
})
process.stdout.write((r.stdout || '') + (r.stderr || ''))
