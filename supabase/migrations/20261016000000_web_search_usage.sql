alter table public.llm_usage add column if not exists web_search_requests integer not null default 0;
