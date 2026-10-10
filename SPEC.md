# Perfect Profile Prospecting — Spec v1.3

**Updated:** 10 October 2026 (supersedes v1.2, kept in `archive/`)
**Business:** Perfect Profile — https://perfectprofile.com.au
**Geography:** Melbourne first, national later via photographer network
**Currency:** AUD

---

## 1. What this is

An internal tool to find, qualify and work corporate photography leads
(team headshots, on-site staff shoots, executive/board portraits), with
individual professionals as a secondary lead type.

Goal: **qualified, commercially viable opportunities — not lead volume.**

## 2. Decisions log (v1.3 review)

| Topic | Decision | Consequence |
|---|---|---|
| Users | One user now; team planned but not hired | Single login. Every lead has `owner_id` and every action is logged, so a team can be added without rework. No roles/assignment UI in MVP. |
| Builder | Owner, using Claude Code | Spec is a working doc, not a contractor handover. |
| Pricing | Not yet known | Headcount is the proxy for value until pricing is set (§4). Pricing lives in settings, never hardcoded. |
| Commercial threshold | Target A$2,000, hard floor A$1,400 | Two-threshold gate (§4). |
| Individuals | Kept as a lead type, same scoring | Most will fall below the floor unless bundled or strategic. No separate scoring model. |
| First slice | CRM / pipeline | Manual capture before any automation. |
| Sending | Tool **never sends** | Drafts are copied into email/LinkedIn by hand. Permission, suppression and unsubscribe tooling removed; replaced by a `do_not_contact` flag. |
| Current lead sources | LinkedIn outreach, referrals | Fast manual capture is the core feature; every lead records its source. |
| Discovery | One experiment: ASX announcements | Treated as a test, judged on results before adding sources. |
| Stack | One language: TypeScript | Next.js + Supabase. No separate Python backend. |

## 3. Scope

**MVP**
- Leads, companies, contacts, activities, owner and audit log.
- Quick capture: paste company name / website / LinkedIn URL + note + source.
- Pipeline statuses and outcome tracking (won/lost, actual revenue).
- Commercial gate and 100-point score with a visible breakdown.
- Evidence-backed outreach drafts (Claude API) with a "copy" button.
- Settings: thresholds, headcount proxy, pricing inputs (blank until known), score bands, freshness windows.

**Phase 2 (experiment)**
- ASX announcements → executive/board appointment signals → candidate leads for review.

**Later, only if results justify it**
- More sources (news search API, careers pages, AusTender, ABN Lookup verification).
- Multi-user roles and assignment.
- National delivery feasibility / photographer capacity tracking.

**Cut**
- Any automated sending; Spam Act sending controls (revisit only if sending is ever added).
- LinkedIn scraping, automated connection requests or messaging.
- Separate individual scoring model.
- Vector DB, multi-agent frameworks, proprietary model training.

## 4. Commercial gate

| State | Rule |
|---|---|
| `qualified` | Estimated value ≥ A$2,000 |
| `strategic_exception` | Estimated A$1,400–1,999 **and** a recorded reason (CEO/board, repeat-work potential, multi-office relationship, foot-in-door to a larger confirmed job) |
| `below_threshold` | Estimated < A$1,400, or A$1,400–1,999 with no exception |
| `needs_research` | Value or headcount unknown |

**Until pricing is known**, estimate value from headcount:
- Setting `headcount_for_target` (placeholder: 15 people — confirm).
- Setting `headcount_for_floor` (placeholder: 10 people — confirm).
- Executive/board shoots are flagged for manual valuation rather than headcount.

Unknown values are never invented to pass the gate. Only `qualified` and
`strategic_exception` enter the priority queue.

## 5. Scoring (100 points, ranking only — not a probability)

- Buying-signal strength: 25
- Evidence of a viable project (size, headcount, locations): 25
- Service fit: 20
- Timing / freshness: 15
- Evidence quality + buyer identified: 15

Bands: 80+ high · 65–79 review · 45–64 needs research · <45 don't pursue.

Freshness: `max(0, 1 - age_days / window_days)`. Default windows: hiring 30,
executive appointment 45, business launch 60, rebrand/office/expansion 90,
event until event date + grace. All configurable.

Signal priorities (tender > rebrand / new office / hiring burst / CEO-board /
merger > graduate intake / onboarding > event / launch / team page) are
hypotheses to calibrate against real outcomes.

## 6. Data model (Supabase Postgres, UUID keys, migrations)

- `companies` — name, domain, industry, employee range, city/state, ABN (optional), office count.
- `contacts` — company, name, title, business contact (sourced only), source, verified, `do_not_contact`.
- `leads` — company/contact, lead type (corporate / executive / individual), `source` (linkedin / referral / website / asx / other), `owner_id`, status, score + breakdown, commercial state, est. headcount, est. value low/high, assumptions, exception reason, recommended service, next action.
- `signals` — company, type, source URL, published date + date confidence, discovered at, summary, expiry.
- `lead_signals` — lead ↔ signal, score contribution.
- `activities` — append-only log: created, reviewed, contacted, replied, meeting, proposal, won/lost (+ actual revenue), with `user_id`.
- `outreach_drafts` — lead, channel, body, evidence refs, created/copied at.
- `settings` — thresholds, headcount proxy, pricing inputs, bands, freshness windows, service catalogue.
- `discovery_runs` (Phase 2) — source, start/end, found/accepted/rejected, errors, cost.

Dropped from v1.2: `marketing_permissions`, `suppression_list`, full `sources` registry (one source → a config entry is enough for now).

## 7. Stack

- Next.js (App Router) + TypeScript + Tailwind.
- Supabase: Postgres, Auth, row-level security from day one (owner-scoped, ready for a team).
- Claude API behind a small provider interface; server-side only.
- Phase 2 job: Supabase scheduled function or Vercel cron.
- Hosting: Vercel + Supabase free/low tiers.

## 8. Build plan

1. **Scaffold** — repo, Next.js, Supabase project, auth, migrations for §6.
2. **Capture + pipeline** — quick-add form, lead list (filters: status, source, commercial state, score), lead detail with activity timeline.
3. **Gate + score** — settings page; gate and score computed and explained on the lead detail.
4. **Drafts** — Claude generates a draft from the lead's evidence only; copy button; log when copied.
5. **Outcomes report** — leads by source, conversion, actual revenue vs estimate.
6. **ASX experiment** — fetch appointment announcements (after confirming ASX terms of use permit it), create signals and candidate leads for review. Judge after ~50 reviewed candidates.

## 9. Success criteria

- Every LinkedIn/referral lead lives in the tool, with source and outcome recorded.
- High-priority leads have valid evidence ≥ 90% of the time; drafts contain no unsupported claims.
- ASX experiment: decide keep/drop based on accepted-candidate rate and any meetings produced.

## 10. Open questions

1. Pricing model and a rough per-head figure — replaces the headcount proxy.
2. Confirm headcount placeholders (15 / 10).
3. Melbourne boundary (metro only? Geelong?).
4. Approved service claims and turnaround times from the live website.
5. ASX announcements terms of use for automated access.
