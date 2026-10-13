# Working on PRAYASH

## Owner’s standing instruction: security first

The owner’s instruction for every website built with Claude: **make it as
strong as possible against attackers, and never show error details to users**
— detailed errors help attackers. Apply this to every change, without being
asked again.

### Never expose error details

- People only ever see short, friendly messages. Never show raw database,
  Supabase, PostgREST, storage, Edge Function or JavaScript error text, stack
  traces, SQL, table/column/constraint names, file paths, IDs of internal
  objects, or library names.
- In the browser, every error goes through `toAppError()` / `errorMessage()`
  (`src/lib/errors.ts`). Throw `AppError(kind, message)` with a message written
  for people; never interpolate `error.message` from a library into UI text.
- Database functions raise errors only through `private.fail(code, message)`,
  with a `snake_case` code in `hint`. Only those messages are shown; anything
  else becomes a generic message (client and `dbErrorToHttp()` in
  `supabase/functions/_shared/http.ts`).
- Edge Functions return `{ ok: false, error: { code, message } }` with safe
  messages, and a generic 500 for anything unexpected.
- Logs record event names and counts only — never form contents, personal
  data, tokens or raw error objects. No `console.log` of data in the browser.
- Sign-in, password reset and status lookup must not reveal whether an
  account, email, phone or reference exists.
- Production builds ship without source maps.
- Tests in `src/lib/errors.test.ts` lock this in; extend them when adding
  error paths.

### Build defensively

- The database is the security boundary: RLS on every table, deny by default,
  explicit grants, `SECURITY DEFINER` functions with `set search_path = ''`
  that check the caller’s role. Never rely on hiding things in the UI.
- Never put the service-role key or any secret in frontend code or `VITE_`
  variables. Privileged work happens only in Edge Functions after the database
  has confirmed the caller’s role.
- Validate every input on the server (Zod in functions + database checks),
  not only in the browser. Rate-limit public endpoints; keep honeypot and
  timing checks; check uploaded files by content, not name.
- No personal data in URLs, analytics, logs or notifications.
- Keep the Content-Security-Policy and security headers in `vercel.json`
  strict. Add a third-party origin only when strictly needed.
- Render user content as text (Markdown without raw HTML). No
  `dangerouslySetInnerHTML`, `eval` or inline scripts.
- Pin dependencies to released versions at least 14 days old and keep
  `npm audit --omit=dev` at zero.
- Never weaken a security check or skip a test to make something pass.

## Project conventions

- Never invent facts about PRAYASH (history, numbers, registration, people).
  Use labelled placeholders until the organisation provides real content.
- Schema changes go in a new file in `supabase/migrations/`; end security
  migrations with `select private.assert_security_invariants();`.
- Before committing, run: `npx tsc -b`, `npm run typecheck:functions`,
  `npx eslint .`, `npm test`; with the local stack (`npm run stack:start`):
  `npm run test:db`, `npm run test:functions`, `npm run test:e2e`.
- Documentation lives in `docs/` (security model: `docs/SECURITY.md`).
