# Project context — handoff for new sessions

**Last updated:** 10 October 2026
Read this first, then `SPEC.md` (v1.3) and `README.md`.

## What this is
Internal lead-generation tool for **Perfect Profile** (corporate headshots, Melbourne first).
It captures leads, checks commercial viability, scores them, recommends a service and drafts
outreach. Goal: qualified, viable opportunities, not lead volume.

## Key decisions (from the spec review)
- **Users:** one user now (owner); team planned but not hired. Every lead has `owner_id` and
  all actions are logged, so multi-user can be added later.
- **Built by:** the owner using Claude Code (Opus as lead, Sonnet sub-agents doing code).
- **Commercial gate:** target **A$2,000**, hard floor **A$1,400**. A$1,400–1,999 needs a
  recorded exception reason (→ `strategic_exception`), else `below_threshold`. Unknown → `needs_research`.
- **Pricing unknown:** value estimated from headcount (placeholders: 10 heads = A$1,400,
  15 heads = A$2,000; editable in Settings). Pricing fields stay blank until confirmed.
- **Never sends messages.** Drafts only; user copies into email/LinkedIn. No Spam Act
  sending tooling; just a `do_not_contact` flag.
- **LinkedIn:** manual only. User finds people on LinkedIn, logs them in the tool, copies
  drafts back. No scraping or automation (LinkedIn User Agreement).
- **Individuals:** kept as a lead type, same scoring as corporate.
- **Stack:** Next.js 16 (App Router, Cache Components on) + TypeScript + Tailwind 4 +
  Supabase (Postgres, Auth, RLS) + Claude API (`claude-opus-5-5`, via `ANTHROPIC_MODEL`).

## Current state (built, tested locally, committed)
- Auth (email/password), owner-scoped row-level security on every table (verified with a
  second user: no cross-user access).
- Quick lead capture, leads list with filters and summary strip, lead detail (evidence,
  score breakdown, value estimate + assumptions, known/unknown, activity timeline,
  status/estimates/notes/won-lost), settings page.
- Scoring engine (100 pts) + commercial gate + auto service recommendation — 67 unit tests.
- Settings save rescores all leads; manual value overrides preserved (`value_is_manual`).
- Outreach drafts (email ≤150 words, LinkedIn ≤80) from evidence only; do-not-contact guard.
  **Not yet tested against the real Claude API** (no `ANTHROPIC_API_KEY` set).
- Migrations: `supabase/migrations/20261010000000_init.sql`, `20261010000100_lead_value_is_manual.sql`.

## Running locally
- `npx supabase start` (Docker) — local DB with migrations applied; `npx supabase stop` to stop.
- `.env.local` (gitignored) holds local Supabase keys and a local test login
  (`TEST_USER_EMAIL` / `TEST_USER_PASSWORD`). Add `ANTHROPIC_API_KEY` there to test drafts.
- `npm run dev` (or the `.claude/launch.json` preview config). Checks: `npm run typecheck`,
  `npm run lint`, `npm run test`, `npm run build`.
- Next 16 notes: per-user pages stream behind `<Suspense>`; `requireUser()` calls
  `connection()`; session refresh lives in `src/proxy.ts`; `/` → `/leads` redirect is in `next.config.ts`.

## News discovery (built 10 Oct 2026, not yet run against real APIs)
ASX was dropped: its terms (updated 25 May 2026) prohibit automated access without written consent.
Replaced by **news search discovery** at `/discovery`:
- Brave Search News API (`BRAVE_SEARCH_API_KEY`) runs the queries in Settings `discovery_queries`
  (editable on the Discovery page). Claude (`src/lib/discovery/classify.ts`) classifies each result
  from title/snippet only; relevant ones go to a review queue, the rest are kept as `filtered` so a URL is never paid for twice.
- Accept → creates a lead (source `news`) with the signal + source URL, then rescored. Reject/restore supported.
- Manual "Run discovery now" button only (no cron yet). Migration: `20261011000000_news_discovery.sql`.
- Code: `src/lib/discovery/*` (pure, 31 tests), `src/lib/db/discovery.ts`, `src/app/(app)/discovery/*`.
- To check before relying on it: Brave's terms on storing results (stored rows include headline/snippet/URL);
  Brave now needs a card even for the ~US$5/month free credit — set a spend cap in its dashboard.
- Judge the experiment on acceptance rate (shown on the page) and meetings from `news` leads.

## Other open items
- Confirm pricing (rough per-head figure) and headcount placeholders (15 / 10).
- Melbourne boundary (metro only? Geelong?).
- Approved service claims and turnaround times from perfectprofile.com.au (drafts may only use approved claims).
- Hosted Supabase project + real keys for actual use.
- Possible LinkedIn helpers: paste-a-URL capture; follow-up tracking (connection sent /
  accepted / replied + reminders).
