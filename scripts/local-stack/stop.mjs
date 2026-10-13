#!/usr/bin/env node
// Stops the local stack.   node scripts/local-stack/stop.mjs [--wipe]
import { existsSync, rmSync } from 'node:fs';
import { PG_DATA, STACK_DIR, STATE_FILE, STORAGE_DIR } from './config.mjs';
import { pgCommand, pgIsRunning, readState } from './lib.mjs';
import { spawnSync } from 'node:child_process';

const state = readState();
for (const [name, pid] of Object.entries(state?.pids ?? {})) {
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      /* already stopped */
    }
  }
  console.log(`stopped ${name}`);
}
if (existsSync(STATE_FILE)) rmSync(STATE_FILE);

if (pgIsRunning()) {
  const [cmd, args] = pgCommand('pg_ctl', ['-D', PG_DATA, '-m', 'fast', '-w', 'stop']);
  spawnSync(cmd, args, { stdio: 'inherit' });
}

if (process.argv.includes('--wipe')) {
  rmSync(PG_DATA, { recursive: true, force: true });
  rmSync(STORAGE_DIR, { recursive: true, force: true });
  console.log(`wiped database and storage under ${STACK_DIR}`);
}
