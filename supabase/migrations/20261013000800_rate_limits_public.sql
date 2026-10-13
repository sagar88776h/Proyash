-- =============================================================================
-- PRAYASH · 0800 · Rate limiting and public aggregate functions
-- =============================================================================

-- Fixed-window counters. Keys are hashes (e.g. "assist_ip:<sha256 prefix>"),
-- never raw IP addresses or phone numbers.
create table private.rate_limits (
  bucket text not null check (bucket ~ '^[a-z_]{2,32}:[a-f0-9]{16,64}$'),
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket, window_start)
);
alter table private.rate_limits enable row level security;

create function public.consume_rate_limit(p_bucket text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz;
  v_hits integer;
begin
  if p_limit < 1 or p_window_seconds < 1 or p_window_seconds > 86400 * 7 then
    perform private.fail('invalid_rate_limit', 'Invalid rate limit parameters.', '22023');
  end if;
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into private.rate_limits as rl (bucket, window_start, hits)
  values (p_bucket, v_window, 1)
  on conflict (bucket, window_start) do update set hits = rl.hits + 1
  returning hits into v_hits;

  -- Opportunistic clean-up of expired windows.
  if random() < 0.02 then
    delete from private.rate_limits where window_start < now() - interval '8 days';
  end if;

  return v_hits <= p_limit;
end;
$$;
revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;

-- Verified impact indicators for the homepage. Every figure is derived from
-- published, verified records — nothing is entered as a free-standing number.
create function public.get_public_impact_summary()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'projects_completed', (select count(*) from public.projects where is_published and status = 'completed'),
    'projects_ongoing', (select count(*) from public.projects where is_published and status = 'ongoing'),
    'villages_reached', (
      select count(distinct p.village_id)
      from public.projects p
      join public.villages v on v.id = p.village_id and v.is_published
      where p.is_published and p.status in ('ongoing', 'completed')
    ),
    'active_volunteers', (select count(*) from public.volunteers where status in ('approved', 'active')),
    'featured_outcomes', coalesce((
      select jsonb_agg(x order by x.sort_order, x.outcome_date desc nulls last)
      from (
        select o.id, o.label, o.quantity, o.unit, o.outcome_date, o.sort_order,
               p.title as project_title, p.slug as project_slug
        from public.project_outcomes o
        join public.projects p on p.id = o.project_id and p.is_published
        where o.is_verified and o.is_featured
        order by o.sort_order, o.outcome_date desc nulls last
        limit 6
      ) x
    ), '[]'::jsonb)
  );
$$;
revoke all on function public.get_public_impact_summary() from public;
grant execute on function public.get_public_impact_summary() to anon, authenticated;
