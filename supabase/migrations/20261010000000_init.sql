-- Perfect Profile Prospecting: initial schema (SPEC.md section 6). RLS owner-scoped.

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null,
  domain text,
  industry text,
  employee_range text,
  city text,
  state text,
  abn text,
  office_count integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index companies_owner_idx on public.companies(owner_id);
create index companies_owner_domain_idx on public.companies(owner_id, lower(domain));
create index companies_owner_name_idx on public.companies(owner_id, lower(name));

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  company_id uuid references public.companies(id) on delete set null,
  name text not null,
  title text,
  email text,
  phone text,
  linkedin_url text,
  source_note text,
  verified boolean not null default false,
  do_not_contact boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index contacts_owner_idx on public.contacts(owner_id);
create index contacts_company_idx on public.contacts(company_id);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  company_id uuid references public.companies(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  lead_type text not null check (lead_type in ('corporate','executive','individual')),
  source text not null check (source in ('linkedin','referral','website','asx','other')),
  status text not null default 'new' check (status in ('new','researching','contacted','meeting','proposal','won','lost','nurture','dismissed')),
  title text not null,
  notes text,
  est_headcount integer,
  est_locations integer,
  est_value_low numeric,
  est_value_high numeric,
  assumptions text,
  exception_reason text,
  commercial_state text not null default 'needs_research' check (commercial_state in ('qualified','strategic_exception','below_threshold','needs_research')),
  score integer,
  score_breakdown jsonb,
  recommended_service text,
  next_action text,
  actual_revenue numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index leads_owner_idx on public.leads(owner_id);
create index leads_owner_status_idx on public.leads(owner_id, status);
create index leads_owner_commercial_idx on public.leads(owner_id, commercial_state);
create index leads_owner_score_idx on public.leads(owner_id, score desc nulls last);
create index leads_owner_source_idx on public.leads(owner_id, source);
create index leads_company_idx on public.leads(company_id);

create table public.signals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  company_id uuid references public.companies(id) on delete set null,
  signal_type text not null check (signal_type in ('tender','rebrand','new_office','hiring','exec_appointment','merger','graduate_intake','onboarding','event','business_launch','team_page','other')),
  source_url text,
  published_at timestamptz,
  date_confidence text not null default 'unknown' check (date_confidence in ('exact','approximate','unknown')),
  discovered_at timestamptz not null default now(),
  summary text not null,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index signals_owner_idx on public.signals(owner_id);
create index signals_company_idx on public.signals(company_id);

create table public.lead_signals (
  lead_id uuid not null references public.leads(id) on delete cascade,
  signal_id uuid not null references public.signals(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  contribution numeric,
  primary key (lead_id, signal_id)
);
create index lead_signals_signal_idx on public.lead_signals(signal_id);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  user_id uuid not null references auth.users(id) default auth.uid(),
  activity_type text not null check (activity_type in ('created','status_changed','reviewed','contacted','replied','meeting_booked','proposal_sent','won','lost','note','draft_generated','draft_copied','updated')),
  detail text,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index activities_lead_created_idx on public.activities(lead_id, created_at);
create index activities_owner_idx on public.activities(owner_id);

create table public.outreach_drafts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  channel text not null check (channel in ('email','linkedin')),
  subject text,
  body text not null,
  evidence_refs text[] not null default '{}',
  created_by uuid not null references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  copied_at timestamptz
);
create index outreach_drafts_lead_idx on public.outreach_drafts(lead_id, created_at);
create index outreach_drafts_owner_idx on public.outreach_drafts(owner_id);

create table public.settings (
  owner_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger companies_updated before update on public.companies for each row execute function public.set_updated_at();
create trigger contacts_updated before update on public.contacts for each row execute function public.set_updated_at();
create trigger leads_updated before update on public.leads for each row execute function public.set_updated_at();
create trigger settings_updated before update on public.settings for each row execute function public.set_updated_at();

-- Row-level security
alter table public.companies enable row level security;
alter table public.contacts enable row level security;
alter table public.leads enable row level security;
alter table public.signals enable row level security;
alter table public.lead_signals enable row level security;
alter table public.activities enable row level security;
alter table public.outreach_drafts enable row level security;
alter table public.settings enable row level security;

do $$
declare t text;
begin
  foreach t in array array['companies','contacts','leads','signals','lead_signals','outreach_drafts','settings'] loop
    execute format('create policy %I on public.%I for select to authenticated using (owner_id = (select auth.uid()))', t||'_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (owner_id = (select auth.uid()))', t||'_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))', t||'_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (owner_id = (select auth.uid()))', t||'_delete', t);
  end loop;
end $$;

-- Activities: append-only (select + insert only)
create policy activities_select on public.activities for select to authenticated using (owner_id = (select auth.uid()));
create policy activities_insert on public.activities for insert to authenticated
  with check (owner_id = (select auth.uid()) and user_id = (select auth.uid()));
