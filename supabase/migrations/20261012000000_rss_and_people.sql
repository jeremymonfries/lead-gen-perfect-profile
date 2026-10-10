-- RSS feeds as a discovery source, and people named in discovered articles.

alter table public.discovery_candidates
  add column if not exists origin_type text not null default 'search' check (origin_type in ('search','rss')),
  add column if not exists people jsonb not null default '[]'::jsonb; -- [{name, title, role}] named in the item (evidence only)

alter table public.discovery_runs
  add column if not exists feeds_checked integer not null default 0,
  add column if not exists feed_items integer not null default 0,     -- recent feed items before keyword filter
  add column if not exists prefiltered_out integer not null default 0; -- feed items dropped by the keyword filter

-- Speeds up "people at this company" on the lead page.
create index if not exists contacts_owner_company_idx on public.contacts(owner_id, company_id);
