-- Runs after Supabase Auth has migrated the `auth` schema.
-- Mirrors the grants hosted Supabase gives on auth helper functions/tables.
-- LOCAL TEST STACK ONLY.
grant execute on all functions in schema auth to anon, authenticated, service_role, postgres;
grant select, references, trigger on all tables in schema auth to postgres;
grant all on all tables in schema auth to supabase_auth_admin;
