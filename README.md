# Perfect Profile Prospecting

Internal lead-gen CRM for Perfect Profile corporate photography (Next.js 16 App Router + Supabase + Claude).
See `SPEC.md` for the product spec and `CONTEXT.md` for current state and decisions.

Repo: https://github.com/jeremymonfries/lead-gen-perfect-profile (private)

## Features
- Quick lead capture, pipeline, lead detail with activity timeline.
- Commercial gate (target A$2,000 / floor A$1,400) and 100-point score with breakdown.
- Evidence-only outreach drafts (Claude) with a copy button. The tool never sends messages.
- **Discovery** (`/discovery`): Brave news search → Claude filters results into a review queue →
  accept to create a lead. Nothing is contacted automatically.

## Setup
1. `npm install`
2. `cp .env.example .env.local` and fill in values:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `ANTHROPIC_API_KEY` (drafts and discovery), `ANTHROPIC_MODEL` (default `claude-opus-5-5`)
   - `BRAVE_SEARCH_API_KEY` (discovery; set a spend cap in the Brave dashboard)
3. Database: either local `npx supabase start` (Docker), or create a hosted Supabase project and run `npx supabase link --project-ref <ref>`.
4. Apply migrations: `npx supabase db push` (hosted), or locally `npx supabase migration up` (keeps data) / `npx supabase db reset` (wipes data).
5. `npm run dev` and open http://localhost:3000.

## Scripts
`npm run dev | build | lint | typecheck | test`
