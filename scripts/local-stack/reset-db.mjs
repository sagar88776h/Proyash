#!/usr/bin/env node
// Wipes the local database and storage, then starts the stack fresh.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { ROOT } from './config.mjs';

const stop = spawnSync(process.execPath, [join(ROOT, 'scripts/local-stack/stop.mjs'), '--wipe'], { stdio: 'inherit' });
if (stop.status !== 0) process.exit(stop.status ?? 1);
const start = spawnSync(process.execPath, [join(ROOT, 'scripts/local-stack/start.mjs'), ...process.argv.slice(2)], {
  stdio: 'inherit',
});
process.exit(start.status ?? 1);
