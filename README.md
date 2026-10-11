# Perfect Profile Prospecting

Internal lead-gen CRM for Perfect Profile corporate photography (Next.js 16 App Router + Supabase + Claude).
See `SPEC.md` for the product spec and `CONTEXT.md` for current state and decisions.

Repo: https://github.com/jeremymonfries/lead-gen-perfect-profile (private)

## Features
- Quick lead capture, pipeline, lead detail with activity timeline.
- Commercial gate (target A$2,000 / floor A$1,400) and 100-point score with breakdown.
- Evidence-only outreach drafts (Claude) with a copy button. The tool never sends messages.
- **Discovery** (`/discovery`): RSS feeds (free, daily) plus a separate, less frequent "Search news" step using Claude web search (about US$0.01 per query) → keyword filter → Claude
  filters results and names the people involved → review queue → accept to create a lead with contacts.
  Nothing is contacted automatically.
- **People to contact** on each lead: suggested buyer roles with LinkedIn search links (opened by you),
  people on file, and an on-demand lookup of the company's public team pages.

## Setup
1. `npm install`
2. `cp .env.example .env.local` and fill in values:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `ANTHROPIC_API_KEY` (drafts, discovery, website lookup — required for these), `ANTHROPIC_MODEL` (default `claude-opus-5-5`)
3. Database: either local `npx supabase start` (Docker), or create a hosted Supabase project and run `npx supabase link --project-ref <ref>`.
4. Apply migrations: `npx supabase db push` (hosted), or locally `npx supabase migration up` (keeps data) / `npx supabase db reset` (wipes data).
5. `npm run dev` and open http://localhost:3000.

## Scripts
`npm run dev | build | lint | typecheck | test`
