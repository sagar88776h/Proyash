import { spawn, spawnSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { chownSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { DB_URL, JWT_SECRET, LOG_DIR, PG_BIN, PG_DATA, PORTS, ROOT, STACK_DIR, STATE_FILE } from './config.mjs';

export const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

/** HS256 JWT signing (no dependency). */
export function signJwt(payload, secret = JWT_SECRET) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

export function verifyJwt(token, secret = JWT_SECRET) {
  const [header, body, sig] = String(token).split('.');
  if (!header || !body || !sig) return null;
  const expected = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  if (expected !== sig) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

// Fixed iat/exp so keys are stable across restarts (local only).
export const ANON_KEY = signJwt({ iss: 'supabase-demo', role: 'anon', iat: 1700000000, exp: 2000000000 });
export const SERVICE_ROLE_KEY = signJwt({ iss: 'supabase-demo', role: 'service_role', iat: 1700000000, exp: 2000000000 });

export function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

/** Runs a command as the postgres OS user when we are root (Postgres refuses to run as root). */
export function pgCommand(binary, args) {
  const exe = join(PG_BIN, binary);
  if (isRoot) return ['runuser', ['-u', 'postgres', '--', exe, ...args]];
  return [exe, args];
}

export function runSync(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  if (res.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed (${res.status}):\n${res.stdout}\n${res.stderr}`);
  }
  return res.stdout;
}

export function startDetached(name, cmd, args, { env = {}, cwd = ROOT } = {}) {
  ensureDir(LOG_DIR);
  const logPath = join(LOG_DIR, `${name}.log`);
  const out = openSync(logPath, 'a');
  const child = spawn(cmd, args, {
    cwd,
    env: { ...process.env, ...env },
    detached: true,
    stdio: ['ignore', out, out],
  });
  child.unref();
  return { pid: child.pid, logPath };
}

export async function waitFor(description, check, { timeoutMs = 60_000, intervalMs = 300 } = {}) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    try {
      if (await check()) return;
    } catch (err) {
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Timed out waiting for ${description}${lastError ? `: ${lastError.message}` : ''}`);
}

export async function httpOk(url, init) {
  const res = await fetch(url, init);
  return res.status < 500;
}

export function readState() {
  if (!existsSync(STATE_FILE)) return null;
  return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
}

export function writeState(state) {
  ensureDir(STACK_DIR);
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

export async function withClient(fn, connectionString = DB_URL) {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export async function runSqlFile(client, file) {
  const sql = readFileSync(file, 'utf8');
  await client.query(sql);
}

/** Applies supabase/migrations/*.sql in order, once each, like `supabase db push`. */
export async function applyMigrations({ log = console.log } = {}) {
  const dir = join(ROOT, 'supabase', 'migrations');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  return withClient(async (client) => {
    const { rows } = await client.query('select version from supabase_migrations.schema_migrations');
    const applied = new Set(rows.map((r) => r.version));
    let count = 0;
    for (const file of files) {
      const version = file.split('_')[0];
      if (applied.has(version)) continue;
      const sql = readFileSync(join(dir, file), 'utf8');
      try {
        await client.query('begin');
        await client.query(sql);
        await client.query('insert into supabase_migrations.schema_migrations (version, name) values ($1, $2)', [
          version,
          file.replace(/\.sql$/, ''),
        ]);
        await client.query('commit');
        log(`  applied ${file}`);
        count += 1;
      } catch (err) {
        await client.query('rollback');
        const position = err.position ? Number(err.position) : undefined;
        let context = '';
        if (position) {
          const before = sql.slice(0, position);
          const line = before.split('\n').length;
          context = `\n  at ${file}:${line}: ${sql.split('\n')[line - 1]?.trim()}`;
        }
        throw new Error(`Migration ${file} failed: ${err.message}${err.hint ? ` (hint: ${err.hint})` : ''}${context}`);
      }
    }
    // Ask PostgREST to reload its schema cache.
    await client.query("notify pgrst, 'reload schema'");
    return count;
  });
}

export function chownForPostgres(dir) {
  if (!isRoot) return;
  ensureDir(dir);
  const uid = Number(runSync('id', ['-u', 'postgres']).trim());
  const gid = Number(runSync('id', ['-g', 'postgres']).trim());
  chownSync(dir, uid, gid);
}

export function pgIsRunning() {
  if (!existsSync(join(PG_DATA, 'postmaster.pid'))) return false;
  const [cmd, args] = pgCommand('pg_ctl', ['-D', PG_DATA, 'status']);
  const res = spawnSync(cmd, args, { encoding: 'utf8' });
  return res.status === 0;
}

export { PORTS };
