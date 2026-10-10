# Perfect Profile Prospecting

Internal lead-gen CRM (Next.js App Router + Supabase + Claude). See `SPEC.md`.

## Setup
1. `npm install`
2. `cp .env.example .env.local` and fill in values.
3. Database: either local `npx supabase start` (Docker), or create a hosted Supabase project and run `npx supabase link --project-ref <ref>`.
4. Apply migrations: `npx supabase db push` (hosted) or `npx supabase db reset` (local).
5. `npm run dev` and open http://localhost:3000.

## Scripts
`npm run dev | build | lint | typecheck | test`
