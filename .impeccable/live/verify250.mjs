// Autopilot helper: run the #250 Playwright verification from the scratchpad with the seeded ids.
import { spawnSync } from 'node:child_process'
const r = spawnSync('node', ['/tmp/scratch229/po250.mjs', process.argv[2] ?? 'all'], {
  cwd: '/tmp/scratch229',
  env: {
    ...process.env,
    WS: 'af91555d-7450-4b21-a8ac-73db092617c8',
    INV: '10a4d716-56d4-4311-b322-7297262996d3',
    PO: '9ccd3d76-5325-44b7-8a9a-89650a297874',
    SUG: 'f8aae653-d6f2-497d-90a9-7e2d62dc6356',
    ...(process.argv[3] ? { VERBOSE: '1' } : {}),
    ...(process.argv[4] ? { WIDTHS: process.argv[4] } : {}),
  },
  encoding: 'utf8', maxBuffer: 1e8,
})
process.stdout.write((r.stdout || '') + (r.stderr || ''))
