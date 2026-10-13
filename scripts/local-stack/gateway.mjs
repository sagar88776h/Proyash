#!/usr/bin/env node
// Local API gateway mimicking Supabase's URL layout:
//   /rest/v1/*         → PostgREST
//   /auth/v1/*         → Supabase Auth (GoTrue)
//   /functions/v1/:fn  → Deno edge function processes
//   /storage/v1/*      → filesystem Storage emulator (below)
//
// Storage emulator: implements the subset of the Storage API used by
// supabase-js in this app (upload, download, public URL, signed URLs, remove).
// Like the real Storage service it performs every object operation as the
// caller's Postgres role with their JWT claims, so storage.objects RLS
// policies are enforced exactly as written. LOCAL TEST STACK ONLY.
import { createReadStream, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer, request as httpRequest } from 'node:http';
import { dirname, join, normalize } from 'node:path';
import pg from 'pg';
import { DB_URL, PORTS, STORAGE_DIR } from './config.mjs';
import { ANON_KEY, SERVICE_ROLE_KEY, signJwt, verifyJwt } from './lib.mjs';

const pool = new pg.Pool({ connectionString: DB_URL, max: 8 });

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers':
    'authorization, x-client-info, apikey, content-type, prefer, range, accept-profile, content-profile, x-upsert, cache-control, x-supabase-api-version, x-retry-count, accept',
  'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD',
  'access-control-expose-headers': 'content-range, content-length, content-type, x-total-count',
  'access-control-max-age': '86400',
};

function send(res, status, body, headers = {}) {
  const payload = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {
    ...CORS,
    'content-type': typeof body === 'string' || Buffer.isBuffer(body) ? 'text/plain' : 'application/json',
    ...headers,
  });
  res.end(payload);
}

function storageError(res, httpStatus, statusCode, error, message) {
  send(res, httpStatus, { statusCode: String(statusCode), error, message });
}

function proxy(req, res, port, path, { cors = true, prefix = '' } = {}) {
  const upstream = httpRequest(
    {
      host: '127.0.0.1',
      port,
      method: req.method,
      path: prefix + path,
      headers: { ...req.headers, host: `127.0.0.1:${port}` },
    },
    (up) => {
      const headers = { ...up.headers };
      if (cors) {
        for (const key of Object.keys(headers)) {
          if (key.startsWith('access-control-')) delete headers[key];
        }
        Object.assign(headers, CORS);
      }
      res.writeHead(up.statusCode ?? 502, headers);
      up.pipe(res);
    },
  );
  upstream.on('error', (err) => send(res, 502, { message: `Upstream unavailable: ${err.message}` }));
  req.pipe(upstream);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function apiKeyOk(req) {
  const key = req.headers.apikey;
  return key === ANON_KEY || key === SERVICE_ROLE_KEY;
}

/** Resolves the caller's role and claims from the bearer token (or apikey). */
function callerFromRequest(req) {
  const auth = req.headers.authorization;
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : req.headers.apikey;
  const claims = token ? verifyJwt(token) : null;
  if (!claims || !['anon', 'authenticated', 'service_role'].includes(claims.role)) return null;
  return claims;
}

async function asCaller(claims, fn) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(`set local role ${claims.role}`);
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

function objectFile(bucket, name) {
  const file = normalize(join(STORAGE_DIR, bucket, name));
  if (!file.startsWith(normalize(join(STORAGE_DIR, bucket)) + '/')) throw new Error('invalid path');
  return file;
}

async function bucketInfo(bucket) {
  const { rows } = await pool.query('select * from storage.buckets where id = $1', [bucket]);
  return rows[0] ?? null;
}

function isRlsError(err) {
  return err?.code === '42501' || /row-level security/i.test(err?.message ?? '');
}

async function parseUpload(req) {
  const body = await readBody(req);
  const contentType = req.headers['content-type'] ?? 'application/octet-stream';
  if (contentType.startsWith('multipart/form-data')) {
    const form = await new Request('http://local/upload', {
      method: 'POST',
      headers: { 'content-type': contentType },
      body,
    }).formData();
    for (const [, value] of form.entries()) {
      if (typeof value !== 'string') {
        return { bytes: Buffer.from(await value.arrayBuffer()), mime: value.type || 'application/octet-stream' };
      }
    }
    return { bytes: Buffer.alloc(0), mime: 'application/octet-stream' };
  }
  return { bytes: body, mime: contentType };
}

function streamFile(res, file, mime, extraHeaders = {}) {
  if (!existsSync(file)) return storageError(res, 400, 404, 'not_found', 'Object not found');
  res.writeHead(200, {
    ...CORS,
    'content-type': mime || 'application/octet-stream',
    'content-length': String(statSync(file).size),
    ...extraHeaders,
  });
  createReadStream(file).pipe(res);
}

async function handleStorage(req, res, path) {
  const url = new URL(path, 'http://local');
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent); // ["object", ...]
  if (parts[0] !== 'object') return storageError(res, 501, 501, 'not_implemented', 'Not supported by the local Storage emulator');

  // Public objects: GET /object/public/:bucket/*path (no RLS, bucket must be public)
  if (parts[1] === 'public' && (req.method === 'GET' || req.method === 'HEAD')) {
    const [bucket, ...rest] = parts.slice(2);
    const info = await bucketInfo(bucket);
    if (!info?.public) return storageError(res, 400, 404, 'not_found', 'Bucket not found');
    const name = rest.join('/');
    const { rows } = await pool.query('select metadata from storage.objects where bucket_id = $1 and name = $2', [bucket, name]);
    if (!rows[0]) return storageError(res, 400, 404, 'not_found', 'Object not found');
    return streamFile(res, objectFile(bucket, name), rows[0].metadata?.mimetype, { 'cache-control': 'public, max-age=3600' });
  }

  // Signed download: GET /object/sign/:bucket/*path?token=
  if (parts[1] === 'sign' && req.method === 'GET') {
    const token = url.searchParams.get('token');
    const payload = token ? verifyJwt(token) : null;
    const [bucket, ...rest] = parts.slice(2);
    const name = rest.join('/');
    if (!payload || payload.url !== `${bucket}/${name}`) return storageError(res, 400, 400, 'InvalidJWT', 'Invalid signature');
    const { rows } = await pool.query('select metadata from storage.objects where bucket_id = $1 and name = $2', [bucket, name]);
    if (!rows[0]) return storageError(res, 400, 404, 'not_found', 'Object not found');
    const download = url.searchParams.get('download');
    return streamFile(res, objectFile(bucket, name), rows[0].metadata?.mimetype,
      download !== null ? { 'content-disposition': `attachment; filename="${download || rest.at(-1)}"` } : {});
  }

  if (!apiKeyOk(req)) return storageError(res, 401, 401, 'Unauthorized', 'Invalid API key');
  const claims = callerFromRequest(req);
  if (!claims) return storageError(res, 400, 403, 'Unauthorized', 'invalid signature');

  // Create signed URL(s): POST /object/sign/:bucket[/path]
  if (parts[1] === 'sign' && req.method === 'POST') {
    const [bucket, ...rest] = parts.slice(2);
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    const expiresIn = Math.max(1, Math.min(Number(body.expiresIn) || 60, 60 * 60 * 24 * 7));
    const names = rest.length ? [rest.join('/')] : (body.paths ?? []);
    const visible = await asCaller(claims, async (c) => {
      const { rows } = await c.query('select name from storage.objects where bucket_id = $1 and name = any($2)', [bucket, names]);
      return new Set(rows.map((r) => r.name));
    });
    const now = Math.floor(Date.now() / 1000);
    const sign = (name) => `/object/sign/${bucket}/${name}?token=${signJwt({ url: `${bucket}/${name}`, iat: now, exp: now + expiresIn })}`;
    if (rest.length) {
      if (!visible.has(names[0])) return storageError(res, 400, 404, 'not_found', 'Object not found');
      return send(res, 200, { signedURL: sign(names[0]) });
    }
    return send(res, 200, names.map((name) => visible.has(name)
      ? { path: name, signedURL: sign(name), error: null }
      : { path: name, signedURL: null, error: 'Either the object does not exist or you do not have access to it' }));
  }

  // Remove: DELETE /object/:bucket  { prefixes: [...] }
  if (req.method === 'DELETE' && parts.length === 2) {
    const bucket = parts[1];
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    const names = Array.isArray(body.prefixes) ? body.prefixes : [];
    const deleted = await asCaller(claims, async (c) => {
      const { rows } = await c.query(
        'delete from storage.objects where bucket_id = $1 and name = any($2) returning id, name, bucket_id, metadata, created_at, updated_at',
        [bucket, names],
      );
      return rows;
    });
    for (const row of deleted) rmSync(objectFile(bucket, row.name), { force: true });
    return send(res, 200, deleted);
  }

  // Info: GET /object/info/:bucket/*path
  if (parts[1] === 'info' && req.method === 'GET') {
    const [bucket, ...rest] = parts.slice(2);
    const row = await asCaller(claims, async (c) => {
      const { rows } = await c.query('select * from storage.objects where bucket_id = $1 and name = $2', [bucket, rest.join('/')]);
      return rows[0];
    });
    if (!row) return storageError(res, 400, 404, 'not_found', 'Object not found');
    return send(res, 200, { id: row.id, name: row.name, bucket_id: row.bucket_id, metadata: row.metadata, size: row.metadata?.size, content_type: row.metadata?.mimetype });
  }

  // Authenticated download: GET /object/authenticated/:bucket/*path or /object/:bucket/*path
  if (req.method === 'GET' || req.method === 'HEAD') {
    const offset = parts[1] === 'authenticated' ? 2 : 1;
    const [bucket, ...rest] = parts.slice(offset);
    const name = rest.join('/');
    const row = await asCaller(claims, async (c) => {
      const { rows } = await c.query('select metadata from storage.objects where bucket_id = $1 and name = $2', [bucket, name]);
      return rows[0];
    });
    if (!row) return storageError(res, 400, 404, 'not_found', 'Object not found');
    if (req.method === 'HEAD') {
      res.writeHead(200, { ...CORS, 'content-type': row.metadata?.mimetype ?? 'application/octet-stream' });
      return res.end();
    }
    return streamFile(res, objectFile(bucket, name), row.metadata?.mimetype);
  }

  // Upload: POST|PUT /object/:bucket/*path
  if (req.method === 'POST' || req.method === 'PUT') {
    const [bucket, ...rest] = parts.slice(1);
    const name = rest.join('/');
    const info = await bucketInfo(bucket);
    if (!info) return storageError(res, 400, 404, 'Bucket not found', 'Bucket not found');
    const { bytes, mime } = await parseUpload(req);
    if (info.file_size_limit && bytes.length > Number(info.file_size_limit)) {
      return storageError(res, 413, 413, 'Payload too large', 'The object exceeded the maximum allowed size');
    }
    if (info.allowed_mime_types?.length && !info.allowed_mime_types.includes(mime.split(';')[0])) {
      return storageError(res, 400, 415, 'invalid_mime_type', `mime type ${mime} is not supported`);
    }
    const upsert = req.method === 'PUT' || req.headers['x-upsert'] === 'true';
    const metadata = { mimetype: mime.split(';')[0], size: bytes.length };
    try {
      const row = await asCaller(claims, async (c) => {
        const sql = upsert
          ? `insert into storage.objects (bucket_id, name, owner, owner_id, metadata) values ($1, $2, $3, $4, $5)
             on conflict (bucket_id, name) do update set metadata = excluded.metadata, updated_at = now() returning id`
          : 'insert into storage.objects (bucket_id, name, owner, owner_id, metadata) values ($1, $2, $3, $4, $5) returning id';
        const owner = claims.role === 'authenticated' ? claims.sub : null;
        const { rows } = await c.query(sql, [bucket, name, owner, owner, metadata]);
        return rows[0];
      });
      const file = objectFile(bucket, name);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, bytes);
      return send(res, 200, { Id: row.id, Key: `${bucket}/${name}` });
    } catch (err) {
      if (isRlsError(err)) return storageError(res, 400, 403, 'Unauthorized', 'new row violates row-level security policy');
      if (err.code === '23505') return storageError(res, 400, 409, 'Duplicate', 'The resource already exists');
      throw err;
    }
  }

  return storageError(res, 501, 501, 'not_implemented', 'Not supported by the local Storage emulator');
}

const server = createServer(async (req, res) => {
  const url = req.url ?? '/';
  try {
    if (url === '/health') return send(res, 200, { ok: true });

    const fn = url.match(/^\/functions\/v1\/([a-z0-9-]+)(\/.*|\?.*)?$/);
    if (fn) {
      const port = PORTS.functions[fn[1]];
      if (!port) return send(res, 404, { message: 'Function not found' });
      return proxy(req, res, port, `/${fn[1]}${fn[2] ?? ''}`, { cors: false });
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS);
      return res.end();
    }

    if (url.startsWith('/rest/v1')) {
      if (!apiKeyOk(req)) return send(res, 401, { message: 'No API key found in request' });
      return proxy(req, res, PORTS.postgrest, url.slice('/rest/v1'.length) || '/');
    }
    if (url.startsWith('/auth/v1')) {
      const rest = url.slice('/auth/v1'.length) || '/';
      const open = /^\/(verify|callback|authorize|health)/.test(rest);
      if (!open && !apiKeyOk(req)) return send(res, 401, { message: 'No API key found in request' });
      return proxy(req, res, PORTS.auth, rest);
    }
    if (url.startsWith('/storage/v1')) {
      return await handleStorage(req, res, url.slice('/storage/v1'.length) || '/');
    }
    return send(res, 404, { message: 'Not found' });
  } catch (err) {
    console.error(err);
    if (!res.headersSent) send(res, 500, { message: err.message });
  }
});

server.listen(PORTS.gateway, '127.0.0.1', () => {
  console.log(`gateway listening on ${PORTS.gateway}`);
});
