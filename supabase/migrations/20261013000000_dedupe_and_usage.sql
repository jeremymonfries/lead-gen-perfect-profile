-- Duplicate-story merging and Claude spend tracking.

alter table public.discovery_candidates
  add column if not exists duplicate_of uuid references public.discovery_candidates(id) on delete set null;

alter table public.discovery_runs
  add column if not exists duplicates_merged integer not null default 0,
  add column if not exists cost_usd numeric(10,6) not null default 0;

create table if not exists public.llm_usage (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  job text not null check (job in ('discovery','website','draft')),
  ref_id uuid,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_input_tokens integer not null default 0,
  cache_creation_input_tokens integer not null default 0,
  cost_usd numeric(10,6) not null,
  created_at timestamptz not null default now()
);

create index if not exists llm_usage_owner_created_idx on public.llm_usage(owner_id, created_at desc);

alter table public.llm_usage enable row level security;
create policy llm_usage_select on public.llm_usage for select to authenticated using (owner_id = (select auth.uid()));
create policy llm_usage_insert on public.llm_usage for insert to authenticated with check (owner_id = (select auth.uid()));
