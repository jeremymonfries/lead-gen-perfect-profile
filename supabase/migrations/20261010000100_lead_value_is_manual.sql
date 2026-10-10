-- Track whether a lead's value range was entered manually, so bulk rescoring
-- (e.g. after a settings change) does not overwrite it with the headcount estimate.
alter table public.leads add column if not exists value_is_manual boolean not null default false;

-- Backfill from the activity log for leads already saved with a manual override.
update public.leads l set value_is_manual = true
where exists (
  select 1 from public.activities a
  where a.lead_id = l.id and a.activity_type = 'updated' and a.detail ilike '%manual value override%'
);
