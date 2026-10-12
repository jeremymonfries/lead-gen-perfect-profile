# Project context — handoff for new sessions

**Last updated:** 13 October 2026
Read this first, then `SPEC.md` (v1.3) and `README.md`. `AGENTS.md`: this is Next.js 16 — read
`node_modules/next/dist/docs/` before writing Next code.

## What this is
Internal lead-generation CRM for **Perfect Profile** (corporate headshot photography, Melbourne first).
Finds and captures leads, checks commercial viability, scores them, finds people to contact, drafts
outreach, and reports outcomes. Goal: qualified, viable opportunities, not lead volume.

## How the owner works (important)
- Owner (non-developer) builds with Claude Code. **Lead agent plans, reviews, verifies in the browser and
  commits; Sonnet sub-agents write the code** from self-contained briefs with non-overlapping files.
- Owner is **cost-conscious**: quote costs before paid runs (Claude web search ≈ US$0.12/run) and ask first.
- Owner likes screenshots of UI changes before committing. Commit + push only when asked
  (they usually say "commit and push"). End commits with `Co-Authored-By: Claude …`.
- Explain in plain language; avoid jargon.

## Key decisions
- **One user now** (owner); every row has `owner_id`, owner-scoped RLS on every table, actions logged.
- **Commercial gate:** target A$2,000, floor A$1,400; A$1,400–1,999 needs an exception reason
  (`strategic_exception`), else `below_threshold`; unknown → `needs_research`.
- **Pricing unknown:** value estimated from headcount (placeholders 10 heads = A$1,400, 15 = A$2,000; Settings).
- **Never sends messages.** Drafts only; user copies them. `do_not_contact` flag. Spam Act still applies
  to the user's manual emails.
- **LinkedIn manual only** — tool only renders people-search links the user clicks; never fetches LinkedIn.
- **ASX automation dropped** — ASX terms (25 May 2026) forbid automated access without consent (ComNews
  ~A$1,180/mo). User may read the public announcements page manually; the tool must not fetch it.
- **Brave Search dropped** — its API terms forbid storing results. Replaced by Claude's web search.
- **Run locally for now** (decided 11 Oct) until the tool proves useful. Hosting options costed: Cloudflare
  Workers Paid ~US$5/mo via OpenNext (needs a trial build: OpenNext doesn't yet support Next 16 Node
  `proxy.ts`), Vercel Pro ~US$20/mo (Hobby is non-commercial), Supabase Free (pauses when idle, no backups)
  or Pro ~US$25/mo.

## Stack
Next.js 16 (App Router, **Cache Components on**) + TypeScript + Tailwind 4 + Supabase local (Postgres, Auth, RLS)
+ Anthropic SDK. Claude models chosen per job in Settings (`settings.llm_models`): discovery + website lookup
default `claude-haiku-5-5`, drafts default `claude-opus-5-5`. `ANTHROPIC_MODEL` env is only a fallback.

## Repo
- GitHub (private): https://github.com/jeremymonfries/lead-gen-perfect-profile — branch `main`.
- Remote uses SSH host alias `github.com-jmfolio` (`~/.ssh/config`); HTTPS has no credentials; no `gh` CLI.
- Latest commit: `79d6458 Restyle the interface to Material Design 3`.

## ⚠ Work in progress at handoff (13 Oct 2026)
- **Information-hierarchy redesign** was launched as a Sonnet sub-agent from the previous session (user feedback:
  "content appears similar"). It edits `src/app/globals.css` and the (app) pages — **uncommitted**. Check
  `git status`/`git diff` before starting other UI work. Brief: surface tiers (primary outlined cards vs
  secondary filled `.panel`s, no cards in cards), page header pattern (headline-medium title + primary action
  right), section headings outside cards, ONE KPI strip instead of stat tiles, Discovery toolbar with a
  "Run details" disclosure, structured candidate cards (header/meta/summary · People named | Who to look for
  · Why · actions footer), two-column lead detail (main outlined cards / lighter side panels), settings sections.
  To finish: run typecheck/lint/test/build, screenshot each page in light, dark and 375px phone width, show
  the owner, then commit when they approve. If the diff is broken or incomplete, `git checkout -- .` back to
  `79d6458` and redo it.

## What's built (all committed)
- **Leads CRM:** quick capture, list with filters + summary, lead detail (evidence, score breakdown, value
  estimate, activity timeline, status/estimates/notes/won-lost), settings (rescores all leads on save;
  manual value overrides kept via `value_is_manual`).
- **Scoring:** 100 pts + commercial gate + service recommendation (`src/lib/scoring`).
- **Outreach drafts** (email ≤150 words, LinkedIn ≤80) from evidence + approved claims only.
  Not yet tried with the real API.
- **Discovery** (`/discovery`), review queue of candidates:
  - **Check feeds** (daily, ~US$0.001–0.007/run): 8 RSS feeds (Australasian Lawyer, Elite Agent, Financial
    Newswire, Broker News, ARN, Government News, Inside Retail, Campaign Brief; verified 11 Oct). Keyword
    pre-filter, max 10 items/feed/run, 14-day window. Feeds/keywords/cap editable on the page.
  - **Search news** (weekly, ~US$0.12/run): Claude `web_search_20250305`, one search per query (max 15),
    Melbourne-localised, "(Month YYYY)" appended; relative `page_age` parsed (`parsePageAge`); results
    older than 45 days or undated are dropped. Default queries target Melbourne accounting/law/offices/CEOs.
  - Claude (`classify.ts`) keeps items with a fresh buying signal, extracts org, location, people named
    (appointee / new partner / departing / spokesperson). Trade-feed items aren't rejected just for not
    stating Australia (location "unknown"). Job boards and topic/index pages are rejected. Appointment
    **roundups** are kept (`is_roundup`: Open article / Mark reviewed, no Accept).
  - Every URL is processed once (irrelevant ones stored as `filtered`); the same story from several sources
    is merged (`duplicate_of`); queue sorted Melbourne first.
  - **Accept** → lead (source `news`) + named people as unverified contacts; appointee/new partner (else
    spokesperson) becomes primary; departing never primary.
- **People finding** (lead page): buyer roles per signal with LinkedIn search links, people on file
  ("Set as primary", "Add a person"), **Find people on website** (public team/about pages, max 4, robots.txt,
  SSRF guard incl. private-IP DNS check; names + titles only).
- **Spend tracking:** every Claude call recorded in `llm_usage` (tokens, web searches, cost). Shown per
  run, month-to-date on Discovery and Settings.
- **Outcomes report** (`/reports`): funnel by source / lead type / commercial state / score band / signal,
  won-lead estimate vs actual, discovery effectiveness vs spend; periods all/90d/FY/month.
- **Material 3 UI:** tokens generated from brand oxblood #5E2A2E (`npm run theme` →
  `src/app/m3-tokens.css`, script `scripts/generate-m3-theme.mjs`), light + dark follow macOS, Roboto,
  component classes in `src/app/globals.css`. On-container text darkened to ≥7:1.
- **Launcher + backups:** `Start Perfect Profile.command`, `Back up Perfect Profile.command`,
  Settings → Download backup (`/api/backup`).
- **Tests:** 165 unit tests (`npm run test`).
- **Migrations** (all applied locally): `20261010000000_init`, `…0100_lead_value_is_manual`,
  `20261011000000_news_discovery`, `20261012000000_rss_and_people`, `20261013000000_dedupe_and_usage`,
  `20261014000000_feed_cap`, `20261015000000_candidate_roundup`, `20261016000000_web_search_usage`.

## Running locally
- Owner double-clicks **Start Perfect Profile.command** (starts Docker, local Supabase, applies pending
  migrations, starts the app, opens the browser — usually http://localhost:3001 because 3000 is used by
  another app, "Arbitrage Monitor").
- Login = local test user in `.env.local` (`TEST_USER_EMAIL` / `TEST_USER_PASSWORD`; don't repeat these
  values in chat). All current data belongs to that user.
- `.env.local` (gitignored) has local Supabase keys and **`ANTHROPIC_API_KEY` (set 11 Oct, workspace-scoped,
  expires around 10 Nov 2026 if a 30-day expiry was chosen)**.
- **Never run `npx supabase db reset`** (wipes data). Apply migrations with `npx supabase migration up`.
- Checks: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`.
- Next 16 notes: per-user pages stream behind `<Suspense>`; `requireUser()` calls `connection()`; session
  refresh in `src/proxy.ts`; `/` → `/leads` redirect in `next.config.ts`; `export const maxDuration` works on
  pages with Cache Components (used on `/discovery` and the lead page); `usePathname()` in the nav needs a
  `<Suspense>` wrapper.

## Current data (13 Oct)
About 10 leads (9 accepted from discovery + 1 test lead), ~22 pending candidates, Claude spend ~US$0.38
this month. No won/lost outcomes recorded yet, so the report is mostly empty.

## Suggested next steps
1. Finish and commit the hierarchy redesign (see Work in progress).
2. Owner uses the tool for 1–2 weeks: daily Check feeds, weekly Search news, accept/reject, try Find
   people on website and outreach drafts (first real draft test), record won/lost outcomes.
3. Tune search queries toward news phrasing ("announces", "appoints", "opens"). Feeds/keywords are editable.
4. Optional: "change email/password" in Settings so the owner can stop using the test login.
5. Later: hosting (Cloudflare trial build first), automatic daily feed check.

## Open questions (from SPEC)
- Pricing per head; confirm headcount placeholders (15 / 10).
- Melbourne boundary (metro only? Geelong?).
- Approved service claims and turnaround times from perfectprofile.com.au (drafts may only use approved
  claims; currently none).
