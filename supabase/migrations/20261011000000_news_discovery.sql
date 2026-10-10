-- News search discovery (replaces the ASX experiment, which ASX's terms of use block).
-- Search results are filtered by Claude into a review queue; nothing is contacted automatically.

alter table public.leads drop constraint if exists leads_source_check;
alter table public.leads add constraint leads_source_check
  check (source in ('linkedin','referral','website','asx','news','other'));

create table public.discovery_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  source text not null default 'news',
  status text not null default 'running' check (status in ('running','completed','failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  queries text[] not null default '{}',
  results_found integer not null default 0,      -- new (unseen) search results after de-duplication
  candidates_created integer not null default 0, -- results Claude judged relevant
  search_requests integer not null default 0,
  llm_calls integer not null default 0,
  errors text[] not null default '{}'
);
create index discovery_runs_owner_started_idx on public.discovery_runs(owner_id, started_at desc);

-- Every classified result is kept (including ones Claude filtered out) so the same URL
-- is never paid for twice and the filter's judgement can be audited.
create table public.discovery_candidates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  run_id uuid references public.discovery_runs(id) on delete set null,
  url text not null,
  url_key text not null,
  headline text not null,
  snippet text,
  publisher text,
  published_at timestamptz,
  query text,
  signal_type text check (signal_type in ('tender','rebrand','new_office','hiring','exec_appointment','merger','graduate_intake','onboarding','event','business_launch','team_page','other')),
  company_name text,
  company_domain text,
  city text,
  state text,
  location_match text not null default 'unknown' check (location_match in ('melbourne','australia_other','outside_australia','unknown')),
  est_headcount integer,
  summary text not null,
  rationale text,
  status text not null default 'pending' check (status in ('pending','accepted','rejected','filtered')),
  reject_reason text,
  lead_id uuid references public.leads(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (owner_id, url_key)
);
create index discovery_candidates_owner_status_idx on public.discovery_candidates(owner_id, status, created_at desc);
create index discovery_candidates_run_idx on public.discovery_candidates(run_id);

alter table public.discovery_runs enable row level security;
alter table public.discovery_candidates enable row level security;

do $$
declare t text;
begin
  foreach t in array array['discovery_runs','discovery_candidates'] loop
    execute format('create policy %I on public.%I for select to authenticated using (owner_id = (select auth.uid()))', t||'_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (owner_id = (select auth.uid()))', t||'_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))', t||'_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (owner_id = (select auth.uid()))', t||'_delete', t);
  end loop;
end $$;
