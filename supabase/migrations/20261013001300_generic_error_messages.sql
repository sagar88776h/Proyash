-- =============================================================================
-- PRAYASH · 1300 · Generic messages for append-only records
--
-- Error text can reach the browser, so it must not reveal internal table
-- names. The hint code ('append_only') is unchanged for the application.
-- =============================================================================

create or replace function private.prevent_modification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = '42501',
    message = 'These records are permanent and cannot be modified or deleted.',
    hint = 'append_only';
end;
$$;

select private.assert_security_invariants();
