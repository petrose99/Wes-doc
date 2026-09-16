// Autopilot helper: run the #251 Playwright verification from the scratchpad.
//   node .impeccable/live/verify251.mjs <flow|shots|detect|all> [verbose] [widths]
import { spawnSync } from 'node:child_process'
const script = process.argv[2] === 'settings' ? '/tmp/scratch229/pay251b.mjs' : '/tmp/scratch229/pay251.mjs'
const r = spawnSync('node', [script, process.argv[2] ?? 'all'], {
  cwd: '/tmp/scratch229',
  env: {
    ...process.env,
    WS: 'af91555d-7450-4b21-a8ac-73db092617c8',
    ...(process.argv[3] ? { VERBOSE: '1' } : {}),
    ...(process.argv[4] ? { WIDTHS: process.argv[4] } : {}),
  },
  encoding: 'utf8', maxBuffer: 1e8,
})
process.stdout.write((r.stdout || '') + (r.stderr || ''))
