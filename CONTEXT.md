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
- **Built by:** the owner using Claude Code. **Workflow: Opus is lead (plans, reviews, verifies);
  Sonnet sub-agents write the code.** Give each sub-agent a self-contained brief and separate files.
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

## Repo
- GitHub (private): https://github.com/jeremymonfries/lead-gen-perfect-profile — branch `main`.
- Remote uses the SSH host alias `github.com-jmfolio` (see `~/.ssh/config`); plain HTTPS has no credentials
  and `gh` CLI is not installed.

## Current state (built, tested locally, committed, pushed)
- Auth (email/password), owner-scoped row-level security on every table (verified with a
  second user: no cross-user access).
- Quick lead capture, leads list with filters and summary strip, lead detail (evidence,
  score breakdown, value estimate + assumptions, known/unknown, activity timeline,
  status/estimates/notes/won-lost), settings page.
- Scoring engine (100 pts) + commercial gate + auto service recommendation.
- 124 unit tests in total (`npm run test`).
- Settings save rescores all leads; manual value overrides preserved (`value_is_manual`).
- Outreach drafts (email ≤150 words, LinkedIn ≤80) from evidence only; do-not-contact guard.
  **Not yet tested against the real Claude API** (no `ANTHROPIC_API_KEY` set).
- Migrations: `20261010000000_init.sql`, `20261010000100_lead_value_is_manual.sql`,
  `20261011000000_news_discovery.sql`, `20261012000000_rss_and_people.sql` (all applied to the local DB).
- Not built yet: **outcomes report** (SPEC §8 step 5: leads by source, conversion, actual vs estimate).

## Running locally
- `npx supabase start` (Docker) — local DB with migrations applied; `npx supabase stop` to stop.
  Apply new migrations without wiping data: `npx supabase migration up` (`db reset` wipes local data).
- `.env.local` (gitignored) holds local Supabase keys and a local test login
  (`TEST_USER_EMAIL` / `TEST_USER_PASSWORD`). Add `ANTHROPIC_API_KEY` (drafts + discovery) and
  `BRAVE_SEARCH_API_KEY` (discovery) there, then restart the dev server. Neither is set yet.
- `npm run dev` (or the `.claude/launch.json` preview config). Checks: `npm run typecheck`,
  `npm run lint`, `npm run test`, `npm run build`.
- Next 16 notes: per-user pages stream behind `<Suspense>`; `requireUser()` calls
  `connection()`; session refresh lives in `src/proxy.ts`; `/` → `/leads` redirect is in `next.config.ts`;
  `export const maxDuration` on a page is accepted with Cache Components (used on `/discovery`).
- Port 3000 was taken by another process on 10 Oct, so the preview used an auto-assigned port.

## Discovery: RSS feeds + optional news search (built 10 Oct 2026; not yet run with a real Claude key)
ASX automation was dropped: its terms (updated 25 May 2026) prohibit automated access without written
consent (ComNews licence is ~A$1,180/month). The public announcements page
(asx.com.au/markets/trade-our-cash-market/announcements) may be read **manually** and leads logged by hand;
the tool must not fetch or scrape it.

`/discovery` (manual "Run discovery now"; no cron yet):
- **RSS feeds (main, free)** — Settings `discovery_feeds`, editable on the page. Defaults verified working 10 Oct:
  Campaign Brief, Financial Newswire, Government News, Mediaweek, realcommercial.com.au news, Inside Retail
  (114 recent items → 40 pass the keyword filter → ~3 Claude calls/run). Items must match `discovery_keywords`
  before Claude reads them. Not usable: Lawyers Weekly / Accountants Daily (no feed); Business News Australia,
  HRM, Inside HR, Vic Tenders (Cloudflare — never bypass). The Age / ABC skipped (personal-use feed terms likely).
- **Brave news search (optional)** — only runs when `BRAVE_SEARCH_API_KEY` is set; covers gaps like partner
  promotions and office moves. Check Brave's terms on storing results; set a spend cap.
- Claude (`classify.ts`) classifies from title/snippet only and lists **people named** (appointee / new partner /
  departing / spokesperson). Irrelevant items kept as `filtered` so a URL is never paid for twice.
- Accept → lead (source `news`) + named people saved as unverified contacts; appointee/new partner (else
  spokesperson) becomes primary contact; departing people never primary.

## People finding
- Lead page "People to contact": buyer roles per signal (`src/lib/discovery/buyer-roles.ts`, hypotheses) with
  LinkedIn people-search links (open in the user's browser; tool never fetches LinkedIn), people on file with
  "Set as primary", manual "Add a person".
- "Find people on website" (`src/lib/discovery/website.ts`): on demand per lead; reads the company's public
  team/about pages (max 4), respects robots.txt, same-site redirects only, refuses IP literals/local hosts and
  domains resolving to private IPs; Claude extracts names + titles only (no emails/phones), saved unverified.
- Spam Act still applies when the user emails people manually (business address published + role-relevant =
  inferred consent; bought lists riskier). Paid contact data (Apollo/Hunter) deliberately not built.

Code: `src/lib/discovery/*` (pure, tested), `src/lib/db/{discovery,contacts}.ts`, `src/app/(app)/discovery/*`,
`src/app/(app)/leads/people-actions.ts`, `src/app/(app)/leads/[id]/people-section.tsx`.
Migrations: `20261011000000_news_discovery.sql`, `20261012000000_rss_and_people.sql`.

## Claude cost control
- Models chosen per job on the Settings page (`settings.llm_models`): discovery + website lookup default
  `claude-haiku-5-5`, drafts default `claude-opus-5-5`. `ANTHROPIC_MODEL` env is only a fallback.
- Estimates (11 Oct 2026 prices): a month of daily runs + 20 lookups + 40 drafts ≈ US$0.20 on Haiku vs ≈ US$5.60
  all-Opus (drafts on Opus add ~US$1). User is cost-conscious: recommend a Console spend limit.

## Suggested next steps
1. Add `ANTHROPIC_API_KEY` and do a real discovery run (feeds work without Brave); tune feeds, keywords and the
   classifier prompt from results; try the website lookup on a few accepted leads.
2. Test outreach drafts against the real Claude API.
3. Outcomes report (SPEC §8 step 5).
4. Optional: "ASX announcement" quick-capture shortcut for manually spotted appointments.

## Other open items
- Confirm pricing (rough per-head figure) and headcount placeholders (15 / 10).
- Melbourne boundary (metro only? Geelong?).
- Approved service claims and turnaround times from perfectprofile.com.au (drafts may only use approved claims).
- Hosted Supabase project + real keys for actual use.
- Possible LinkedIn helpers: paste-a-URL capture; follow-up tracking (connection sent /
  accepted / replied + reminders).
