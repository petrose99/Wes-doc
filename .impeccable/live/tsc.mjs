// Autopilot helper: run tsc with a larger heap (the default 2 GB OOMs on this repo).
import { spawnSync } from 'node:child_process';
const r = spawnSync('npx', ['tsc', '--noEmit', '-p', '.'], {
  cwd: '/home/ubuntu/Dev/Wes-doc',
  env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=8192' },
  encoding: 'utf8',
  maxBuffer: 1e8,
});
const out = (r.stdout || '') + (r.stderr || '');
const lines = out.split('\n').filter(Boolean);
console.log(lines.slice(0, 80).join('\n'));
console.log(`\n[tsc exit ${r.status}; ${lines.length} lines]`);
