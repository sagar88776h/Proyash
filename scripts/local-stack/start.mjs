#!/usr/bin/env node
// Starts the Docker-free local Supabase-compatible stack. See config.mjs.
//   node scripts/local-stack/start.mjs [--no-functions]
import { copyFileSync, cpSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  API_URL,
  BIN_DIR,
  DB_URL,
  DOWNLOADS,
  JWT_SECRET,
  LOG_DIR,
  PG_BIN,
  PG_DATA,
  PORTS,
  RATE_LIMIT_SALT,
  ROOT,
  SITE_URL,
  STACK_DIR,
  STORAGE_DIR,
} from './config.mjs';
import {
  ANON_KEY,
  SERVICE_ROLE_KEY,
  applyMigrations,
  chownForPostgres,
  ensureDir,
  httpOk,
  isRoot,
  pgCommand,
  pgIsRunning,
  readState,
  runSqlFile,
  runSync,
  startDetached,
  waitFor,
  withClient,
  writeState,
} from './lib.mjs';

const withFunctions = !process.argv.includes('--no-functions');

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}) ${url}`);
  const { writeFile } = await import('node:fs/promises');
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
}

async function ensureBinaries() {
  ensureDir(BIN_DIR);
  const source = process.env.STACK_BIN_SOURCE; // optional pre-downloaded binaries
  const postgrest = join(BIN_DIR, 'postgrest');
  if (!existsSync(postgrest)) {
    if (source && existsSync(join(source, 'postgrest'))) {
      copyFileSync(join(source, 'postgrest'), postgrest);
    } else {
      console.log('Downloading PostgREST…');
      const archive = join(BIN_DIR, 'postgrest.tar.xz');
      await download(DOWNLOADS.postgrest, archive);
      runSync('tar', ['-xf', archive, '-C', BIN_DIR]);
    }
    runSync('chmod', ['+x', postgrest]);
  }
  const authDir = join(BIN_DIR, 'auth');
  if (!existsSync(join(authDir, 'auth'))) {
    mkdirSync(authDir, { recursive: true });
    if (source && existsSync(join(source, 'auth', 'auth'))) {
      cpSync(join(source, 'auth'), authDir, { recursive: true });
    } else {
      console.log('Downloading Supabase Auth…');
      const archive = join(BIN_DIR, 'auth.tar.gz');
      await download(DOWNLOADS.auth, archive);
      runSync('tar', ['-xzf', archive, '-C', authDir]);
    }
  }
  return { postgrest, auth: join(authDir, 'auth'), authMigrations: join(authDir, 'migrations') };
}

async function startPostgres() {
  if (!PG_BIN) throw new Error('PostgreSQL binaries not found. Set PG_BIN to the directory containing pg_ctl.');
  ensureDir(STACK_DIR);
  let fresh = false;
  if (!existsSync(join(PG_DATA, 'PG_VERSION'))) {
    chownForPostgres(PG_DATA);
    const [cmd, args] = pgCommand('initdb', ['-D', PG_DATA, '-U', 'postgres', '--auth=trust', '-E', 'UTF8', '--locale=C.UTF-8']);
    runSync(cmd, args);
    fresh = true;
  }
  if (!pgIsRunning()) {
    const socketDir = isRoot ? '/tmp' : STACK_DIR;
    const logFile = isRoot ? join(PG_DATA, 'postgres.log') : join(LOG_DIR, 'postgres.log');
    ensureDir(LOG_DIR);
    const [cmd, args] = pgCommand('pg_ctl', [
      '-D', PG_DATA,
      '-l', logFile,
      '-w',
      '-o', `-p ${PORTS.postgres} -c listen_addresses=127.0.0.1 -k ${socketDir} -c timezone=UTC`,
      'start',
    ]);
    runSync(cmd, args);
  }
  await waitFor('postgres', () => withClient(async (c) => (await c.query('select 1')).rowCount === 1));
  return fresh;
}

async function main() {
  ensureDir(STACK_DIR);
  ensureDir(LOG_DIR);
  ensureDir(STORAGE_DIR);
  const previous = readState();
  if (previous?.pids) {
    console.log('Stack appears to be running already (state.json present). Run stack:stop first if needed.');
  }

  const bins = await ensureBinaries();
  const fresh = await startPostgres();
  console.log(`Postgres ready on ${PORTS.postgres}${fresh ? ' (new cluster)' : ''}`);

  await withClient((c) => runSqlFile(c, join(ROOT, 'scripts/local-stack/sql/00_supabase_roles.sql')));

  const pids = {};
  const authEnv = {
    GOTRUE_API_HOST: '127.0.0.1',
    GOTRUE_API_PORT: String(PORTS.auth),
    API_EXTERNAL_URL: `${API_URL}/auth/v1`,
    GOTRUE_DB_DRIVER: 'postgres',
    GOTRUE_DB_DATABASE_URL: `postgres://supabase_auth_admin:postgres@127.0.0.1:${PORTS.postgres}/postgres?search_path=auth&sslmode=disable`,
    GOTRUE_DB_MIGRATIONS_PATH: bins.authMigrations,
    GOTRUE_SITE_URL: SITE_URL,
    GOTRUE_URI_ALLOW_LIST: `${SITE_URL}/**,http://localhost:5173/**,http://127.0.0.1:5173/**`,
    GOTRUE_DISABLE_SIGNUP: 'true',
    GOTRUE_JWT_ADMIN_ROLES: 'service_role',
    GOTRUE_JWT_AUD: 'authenticated',
    GOTRUE_JWT_DEFAULT_GROUP_NAME: 'authenticated',
    GOTRUE_JWT_EXP: '3600',
    GOTRUE_JWT_SECRET: JWT_SECRET,
    GOTRUE_EXTERNAL_EMAIL_ENABLED: 'true',
    GOTRUE_MAILER_AUTOCONFIRM: 'false',
    GOTRUE_SMTP_HOST: '127.0.0.1',
    GOTRUE_SMTP_PORT: String(PORTS.smtp),
    GOTRUE_SMTP_USER: 'local',
    GOTRUE_SMTP_PASS: 'local',
    GOTRUE_SMTP_ADMIN_EMAIL: 'no-reply@prayash.local',
    GOTRUE_SMTP_SENDER_NAME: 'PRAYASH',
    GOTRUE_MAILER_URLPATHS_INVITE: '/auth/v1/verify',
    GOTRUE_MAILER_URLPATHS_CONFIRMATION: '/auth/v1/verify',
    GOTRUE_MAILER_URLPATHS_RECOVERY: '/auth/v1/verify',
    GOTRUE_MAILER_URLPATHS_EMAIL_CHANGE: '/auth/v1/verify',
    GOTRUE_MAILER_TEMPLATES_INVITE: `http://127.0.0.1:${PORTS.mailHttp}/templates/invite.html`,
    GOTRUE_MAILER_TEMPLATES_RECOVERY: `http://127.0.0.1:${PORTS.mailHttp}/templates/recovery.html`,
    GOTRUE_MAILER_TEMPLATES_EMAIL_CHANGE: `http://127.0.0.1:${PORTS.mailHttp}/templates/email_change.html`,
    GOTRUE_MAILER_SUBJECTS_INVITE: 'You have been invited to PRAYASH',
    GOTRUE_MAILER_SUBJECTS_RECOVERY: 'Reset your PRAYASH password',
    GOTRUE_RATE_LIMIT_EMAIL_SENT: '1000',
    GOTRUE_RATE_LIMIT_VERIFY: '1000',
    GOTRUE_RATE_LIMIT_TOKEN_REFRESH: '1000',
    GOTRUE_PASSWORD_MIN_LENGTH: '10',
    GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED: 'true',
    GOTRUE_LOG_LEVEL: 'warn',
  };

  // Mail catcher first: Auth fetches its email templates from it.
  pids.mail = startDetached('mail', process.execPath, [join(ROOT, 'scripts/local-stack/mail.mjs')]).pid;
  await waitFor('mail catcher', () => httpOk(`http://127.0.0.1:${PORTS.mailHttp}/messages`));

  pids.auth = startDetached('auth', bins.auth, [], { env: authEnv, cwd: join(BIN_DIR, 'auth') }).pid;
  await waitFor('auth', () => httpOk(`http://127.0.0.1:${PORTS.auth}/health`), { timeoutMs: 90_000 });
  console.log(`Auth ready on ${PORTS.auth}`);

  await withClient(async (c) => {
    await runSqlFile(c, join(ROOT, 'scripts/local-stack/sql/10_after_auth.sql'));
    await runSqlFile(c, join(ROOT, 'scripts/local-stack/sql/20_storage_schema.sql'));
  });

  console.log('Applying migrations…');
  const applied = await applyMigrations();
  console.log(`  ${applied} new migration(s)`);

  pids.postgrest = startDetached('postgrest', bins.postgrest, [], {
    env: {
      PGRST_DB_URI: `postgres://authenticator:postgres@127.0.0.1:${PORTS.postgres}/postgres`,
      PGRST_DB_SCHEMAS: 'public',
      PGRST_DB_ANON_ROLE: 'anon',
      PGRST_JWT_SECRET: JWT_SECRET,
      PGRST_DB_EXTRA_SEARCH_PATH: 'public,extensions',
      PGRST_DB_MAX_ROWS: '1000',
      PGRST_SERVER_HOST: '127.0.0.1',
      PGRST_SERVER_PORT: String(PORTS.postgrest),
      PGRST_DB_CHANNEL_ENABLED: 'true',
      PGRST_LOG_LEVEL: 'warn',
    },
  }).pid;
  await waitFor('postgrest', () => httpOk(`http://127.0.0.1:${PORTS.postgrest}/`));
  console.log(`PostgREST ready on ${PORTS.postgrest}`);

  const functionEnv = {
    SUPABASE_URL: API_URL,
    SUPABASE_ANON_KEY: ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
    RATE_LIMIT_SALT,
    ALLOWED_ORIGINS: `${SITE_URL},http://localhost:5173,http://127.0.0.1:5173`,
    STAFF_SITE_URL: SITE_URL,
    ...(process.env.STACK_RELAXED_RATE_LIMITS ? { RATE_LIMIT_MULTIPLIER: process.env.STACK_RELAXED_RATE_LIMITS } : {}),
  };
  if (withFunctions) {
    const deno = join(ROOT, 'node_modules', '.bin', 'deno');
    for (const [name, port] of Object.entries(PORTS.functions)) {
      pids[`fn:${name}`] = startDetached(
        `fn-${name}`,
        deno,
        [
          'run',
          '--allow-net',
          '--allow-env',
          '--allow-read',
          '--config',
          join(ROOT, 'supabase/functions/deno.json'),
          join(ROOT, 'scripts/local-stack/serve-function.ts'),
          name,
          String(port),
        ],
        { env: functionEnv },
      ).pid;
    }
  }

  pids.gateway = startDetached('gateway', process.execPath, [join(ROOT, 'scripts/local-stack/gateway.mjs')]).pid;
  await waitFor('gateway', () => httpOk(`${API_URL}/health`));

  if (withFunctions) {
    for (const name of Object.keys(PORTS.functions)) {
      await waitFor(`function ${name}`, async () => {
        const res = await fetch(`${API_URL}/functions/v1/${name}/health`);
        return res.ok;
      }, { timeoutMs: 120_000 });
    }
    console.log('Edge functions ready');
  }

  writeState({ pids, apiUrl: API_URL, dbUrl: DB_URL, anonKey: ANON_KEY, serviceRoleKey: SERVICE_ROLE_KEY, startedAt: new Date().toISOString() });

  console.log(`
Local stack is running
  API (Supabase URL)  ${API_URL}
  Database            ${DB_URL}
  Mail catcher        http://127.0.0.1:${PORTS.mailHttp}/messages
  Anon key            ${ANON_KEY}
  Logs                ${LOG_DIR}
`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
