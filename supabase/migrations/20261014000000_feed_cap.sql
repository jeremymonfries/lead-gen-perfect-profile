alter table public.discovery_runs add column if not exists capped_out integer not null default 0; -- feed items dropped by the per-feed cap
