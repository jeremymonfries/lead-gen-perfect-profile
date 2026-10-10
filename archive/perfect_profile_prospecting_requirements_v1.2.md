# Perfect Profile Prospecting

## Requirements and implementation brief

**Document version:** 1.2\
**Prepared:** 9 October 2026\
**Status:** Ready for technical discovery and MVP implementation\
**Business:** Perfect Profile --- https://perfectprofile.com.au\
**Initial geography:** Melbourne, Victoria\
**Expansion:** Australia-wide through an existing photographer network\
**Currency:** AUD

------------------------------------------------------------------------

## 1. Purpose

Build an internal AI-assisted prospecting application that helps Perfect
Profile identify, qualify, prioritise and convert potential customers
for:

-   Corporate and team headshots.
-   On-site employee photography.
-   Executive and board photography.
-   Brand photography where relevant.
-   Professional headshots bundled with LinkedIn profile optimisation.

The application should identify credible buying signals, explain why an
opportunity may be relevant, estimate whether the project is
commercially viable, identify likely organisers and decision-makers, and
help prepare appropriate next actions.

The objective is **qualified, commercially viable opportunities**, not
maximum lead volume.

## 2. Business context and confirmed requirements

### Confirmed

-   Perfect Profile is an early-stage business and has limited
    acquisition history.
-   A minimum project revenue of **A\$2,000** is required for a job to
    be economically viable under the current business assumption.
-   Small shoots may still be worthwhile for high-profile clients,
    including CEOs and boards, when pricing or strategic value justifies
    them.
-   Pricing is expected to vary with the number of people and project
    scope.
-   Corporate and individual clients are both in scope, with corporate
    opportunities prioritised.
-   Initial prospecting should focus on Melbourne, then expand
    nationally.
-   An existing photographer network can support delivery beyond
    Melbourne, subject to location and capacity checks.
-   Some early clients came through dedicated LinkedIn outreach.
-   No formal customer CRM or documented acquisition dataset exists yet.
-   Initial customer feedback has highlighted ease of booking
    photography slots as a possible advantage; this is not yet validated
    as the primary differentiator.
-   Perfect Profile's proposition includes on-site photography and
    managing employee scheduling so the client does not need to
    coordinate every staff member manually.

### Business website

Use https://perfectprofile.com.au as the primary business-context
source. Before production launch, verify current service descriptions,
turnaround commitments, coverage, booking process and any claims used in
outreach against the live website and approved business information.

### Important distinction

The A\$2,000 minimum is a current commercial rule, not a universal fixed
package price. The system must support configurable pricing, estimate
ranges and explicit strategic exceptions.

## 3. Product goals

1.  Find businesses and individuals with a credible reason to purchase
    photography or profile services.
2.  Prioritise projects that are likely to meet the A\$2,000 minimum or
    qualify for an approved strategic exception.
3.  Identify the person who organises the work and, where possible, the
    budget owner.
4.  Emphasise the value of on-site photography and managed employee
    scheduling when relevant.
5.  Support Melbourne-first delivery and national projects through the
    photographer network.
6.  Generate editable, evidence-grounded outreach drafts.
7.  Record sales outcomes and use them to improve targeting.
8.  Measure commercial results and operational costs.

## 4. Out of scope for the MVP

-   Fully autonomous outbound campaigns.
-   Unauthorised LinkedIn scraping, automated profile harvesting,
    connection requests or messaging.
-   Bypassing website access controls or provider terms.
-   Unverified or fabricated contact information.
-   Automatic quoting or sending binding proposals.
-   Payment processing or customer booking management.
-   A multi-tenant SaaS product for external businesses.
-   Training a proprietary language model.

The MVP is an internal sales research and decision-support tool. Sending
marketing messages must remain disabled until the relevant permission,
compliance and approval controls are implemented and tested.

## 5. Target segments

### A. Corporate team photography --- primary segment

Potential buyers and organisers: - People & Culture Manager - HR Manager
/ HR Business Partner - Employer Brand Manager - Marketing Manager /
Marketing Director - Internal Communications Manager - Office, Workplace
or Operations Manager - Procurement Manager for larger organisations

Relevant circumstances: - Large or sustained recruitment activity - New
office or location opening - Company rebrand or website relaunch -
Merger, acquisition or organisational restructure - New employee
onboarding programmes - Leadership or team-page refresh - Multiple
offices requiring consistent photography

### B. Executive and board photography

Potential contacts: - Executive Assistant - Company Secretary - CEO or
executive office - Corporate Communications - Marketing or Brand
Director - Board support teams

Relevant circumstances: - CEO or board appointments - Leadership-team
changes - New leadership pages - Corporate rebrand - Annual report or
major corporate communications cycle

Small shoots can qualify if the expected fee or explicitly approved
strategic rationale justifies the opportunity.

### C. Multi-office and national organisations

Potential segments: - Professional services - Financial services and
insurance - Technology businesses - Retail and franchise groups -
National corporate offices - Organisations with distributed teams

Qualify actual delivery feasibility, photographer availability, travel
and coordination needs. Do not assume every location can be serviced
merely because a network exists.

### D. Individual professionals --- secondary segment

Potential customers: - Founders and business owners - Consultants and
independent professionals - Executives changing roles - Public
speakers - Professionals launching a business or personal brand

Possible services: - Professional headshots - Executive portraits -
LinkedIn profile optimisation - Combined photography and profile
packages

Individual opportunities below A\$2,000 should normally be deprioritised
unless they are part of a larger package, corporate relationship or
approved strategic exception.

## 6. Buying-signal framework

Every signal must have an identifiable source, date or date-confidence
status, a factual summary and a plausible link to a Perfect Profile
service.

  -----------------------------------------------------------------------
  Signal                  Initial priority        Potential relevance
  ----------------------- ----------------------- -----------------------
  Publicly announced      Very high               Direct evidence of
  photography requirement                         intent
  or tender                                       

  Company rebrand or      High                    Updated team or
  website relaunch                                executive imagery may
                                                  be needed

  New office or major     High                    On-site shoot or
  expansion                                       multi-location
                                                  opportunity

  Multiple relevant job   High                    New starters may need
  advertisements                                  consistent headshots

  CEO or board            High                    Executive or board
  appointment                                     photography

  Acquisition or merger   High                    Consistent imagery
                                                  across teams or brands

  Graduate or trainee     Medium-high             Coordinated staff
  intake                                          photography

  Multiple new starters / Medium-high             Repeatable employee
  onboarding programme                            headshots

  Upcoming company event  Medium                  Potential speaker or
  or conference                                   event photography

  Business or consultancy Medium                  Individual headshot and
  launch                                          profile package

  New leadership/team     Medium                  Possible refresh
  page                                            opportunity
  -----------------------------------------------------------------------

These priorities are hypotheses and should be calibrated using actual
sales outcomes. A signal does not prove that a company needs
photography.

### Signal freshness

Use configurable freshness windows by signal type. Initial defaults: -
Hiring activity: 30 days - Executive appointment: 45 days - Business
launch: 60 days - Rebrand, new office or expansion: 90 days - Event:
until the event date plus a short configurable period

A simple freshness factor may be calculated as:

`freshness = max(0, 1 - age_days / freshness_window_days)`

Expired signals can remain as historical context but should not qualify
as current buying triggers.

## 7. Data sources and permitted collection

Start with two or three reliable source categories, then expand only
when measured quality warrants it.

### Preferred initial sources

1.  Public company news and announcements.
2.  Public company websites, careers pages and team pages.
3.  Permitted job-listing sources or licensed APIs.
4.  Public tender and procurement notices where relevant.
5.  Official business registers for company verification.
6.  Licensed search, news or contact-enrichment providers whose terms
    permit the intended use.

LinkedIn can be used for manual research and verification consistent
with its terms. Do not automate scraping, profile harvesting, connection
requests or messages, and do not bypass access controls. Verify the
current LinkedIn User Agreement and applicable provider terms before
implementing integrations.

### Source registry

Maintain a `sources` table with: - `id` - `name` - `source_type` -
`base_url` - `access_method` - `terms_url` - `licence_notes` -
`permitted_fields` - `rate_limit` - `retention_policy` -
`reliability_rating` - `enabled` - `last_checked_at`

Disable any source whose permitted access or usage rights are unclear.

### Evidence requirements

-   Store the original source URL and discovery timestamp.
-   Prefer original announcements over secondary summaries.
-   Record publication date and date confidence.
-   Deduplicate repeated coverage of the same event.
-   Do not infer budgets, photography needs, contact details or
    purchasing intent without evidence.
-   Clearly label AI hypotheses as hypotheses.

## 8. Commercial qualification and scoring

### 8.1 Commercial gate

Every opportunity receives one of these states: - `qualified`: credible
estimate of at least A\$2,000 in project revenue. - `needs_research`:
potential fit, but scope or value is not yet sufficiently known. -
`below_threshold`: likely below A\$2,000 and no approved exception. -
`strategic_exception`: below threshold but explicitly approved with a
recorded reason.

Only qualified leads and approved strategic exceptions should enter the
high-priority prospect queue.

Unknown project value must not be fabricated to pass the gate.

### 8.2 Corporate score --- 100 points

-   Buying-signal strength: 25
-   Evidence of a commercially viable project: 25
-   Fit with Perfect Profile's services: 20
-   Timing and urgency: 15
-   Evidence quality and buyer identification: 15

Initial bands: - 80--100: high priority - 65--79: review - 45--64: needs
research - Below 45: do not actively pursue

These are ranking scores, not purchase probabilities.

### 8.3 Individual/executive score --- 100 points

Use the same broad dimensions, but assess individual service fit and
project scope appropriately. Do not automatically penalise a small
executive shoot when its likely price or strategic value makes it
viable.

### 8.4 Project value and margin

Use Perfect Profile's configurable pricing inputs. Do not hardcode
unconfirmed rates.

Store: - Estimated participant count - Estimated number of locations -
Proposed service/package - Estimated revenue low/high (AUD) - Pricing
assumptions - Travel/setup assumptions - Estimated delivery costs when
available - Expected gross margin when data supports it - Estimate
confidence

A pricing formula may be configured later, for example:

`estimated_revenue = base_fee + participant_fees + approved_extras`

This is only an example; the actual formula must reflect the business's
real pricing model.

### 8.5 Strategic exceptions

Allow an authorised user to approve an opportunity below A\$2,000 when
there is a recorded reason, such as: - Premium CEO or board assignment -
Credible repeat-work potential - Multi-office relationship - Explicitly
approved strategic client - Small initial job tied to a larger confirmed
opportunity

Do not automatically award prestige points to famous companies.

## 9. Service recommendation rules

-   Staff growth, onboarding or team-page refresh → corporate/team
    headshots.
-   Multiple offices or distributed teams → coordinated multi-location
    photography, subject to capacity validation.
-   CEO/board changes → executive or board photography.
-   Rebrand or website relaunch → team portraits and potentially broader
    brand photography.
-   Business launch or personal-brand refresh → individual headshots and
    potentially LinkedIn profile optimisation.
-   Clear professional-positioning need → profile optimisation or a
    combined package.

The service catalogue, pricing and claims must be configurable and
confirmed by Perfect Profile. Do not promise turnaround times, national
coverage or deliverables unless verified.

## 10. Architecture

Suggested MVP stack: - Frontend: Next.js and TypeScript - UI: Tailwind
CSS and reusable components - Backend: Python with FastAPI -
Database/authentication: Supabase PostgreSQL and Supabase Auth -
Scheduled jobs: managed scheduler or cron - AI: Claude API or another
replaceable LLM provider - Research: search API plus permitted source
fetching - Hosting: managed frontend/backend services - Monitoring:
structured logs and error tracking

Keep search and LLM providers behind interfaces so they can be replaced.
Avoid a vector database or multi-agent framework until a concrete need
exists.

### Processing pipeline

1.  Scheduler starts a research run.
2.  Search adapters identify candidate source URLs.
3.  Fetching layer checks access permissions and source status.
4.  Extraction layer records relevant facts.
5.  Normalisation resolves companies and events.
6.  Deduplication removes repeated events and leads.
7.  Scoring engine applies freshness and commercial rules.
8.  LLM qualifies shortlisted opportunities and recommends services.
9.  Validation checks output schema and evidence references.
10. Leads are saved for human review.
11. Alysia records outcomes.
12. Reporting evaluates source quality, conversion and costs.

A failure at one source must not stop unrelated sources from processing.

## 11. Database requirements

### `companies`

Company name, canonical domain, industry, employee range, city, state,
country, ABN if appropriately verified, website, office count, fit
score, last researched timestamp and audit timestamps.

### `contacts`

Company reference, name, job title, business contact details only where
appropriately sourced, source reference, verification status and
timestamps. Minimise personal data.

### `signals`

Company/contact reference, signal type, source reference, source URL,
publication date, discovery date, factual summary, evidence confidence,
base weight, effective weight, expiry date and status.

### `leads`

Company/contact reference, lead type, status, corporate/individual
score, recommended service, commercial qualification state, estimated
revenue range in AUD, assumptions, confidence, fit rationale, next
action, reviewer and timestamps.

### `lead_signals`

Junction table connecting leads to supporting signals, including
contribution to the score.

### `sources`

Source registry and permitted-use controls.

### `outreach_drafts`

Lead, channel, subject, body, evidence references, approval status,
approver, approval time, sent time and creation time.

### `marketing_permissions`

Contact, channel, permission status, consent type/source/evidence,
recorded time, withdrawal time and review notes. Use explicit states
such as `unknown`, `permitted`, `withdrawn` and `blocked`.

### `suppression_list`

Normalised identifier, channel, reason, source and timestamp. Check
before drafting and immediately before sending.

### `activities`

Lead reviewed/dismissed, contact verified, draft generated/approved,
message sent, reply received, meeting booked, proposal sent, won/lost.
Store timestamps and necessary structured metadata.

### `discovery_runs`

Source, start/end time, status, records found/accepted/rejected, errors
and estimated cost.

Use UUIDs, foreign-key constraints, appropriate indexes and migrations.
Use JSONB only for genuinely variable source-specific attributes.

## 12. Interface requirements

### Dashboard

Display: - Qualified opportunities meeting the A\$2,000 threshold -
High-value executive opportunities - Leads awaiting review - Corporate
vs individual mix - Leads by signal type and source - Meetings,
proposals and wins - Actual revenue and gross profit when recorded -
Research errors and API costs

Clearly distinguish actual results from estimates.

### Opportunity list

Columns: - Company/person - Location - Lead type - Buying signal and
date - Score - Commercial state - Estimated project value - Recommended
service - Review status

Filters: lead type, location, signal type, score, discovery date,
service, commercial state and sales status.

### Lead detail

Show: - Company/person summary - Original evidence links - Signal
timeline - Fit rationale and score breakdown - Known vs unknown
information - Likely organiser and budget owner - Estimated scope/value
and assumptions - Delivery locations and feasibility - Recommended
service and next action - Outreach draft and activity history

Actions: approve, reject, request research, edit classification, draft
outreach, mark contacted, record outcome, nurture, dismiss or suppress.

### Settings

Allow authorised users to configure: - Minimum project value - Pricing
inputs - Strategic exception rules - Target industries and roles -
Geography - Signal freshness windows - Score thresholds - Sources and
run budgets - Service catalogue and approved claims

## 13. Outreach and compliance

The initial product generates drafts only.

Before sending any commercial message, check: 1. Correct recipient
identity and contact details. 2. Source evidence and relevance
rationale. 3. Suppression status. 4. Valid permission for the intended
channel and purpose. 5. Accurate sender identification. 6. Required
unsubscribe mechanism. 7. Human approval.

Australian commercial electronic messaging is subject to the Spam Act
2003 and associated requirements. A publicly listed email address does
not automatically grant permission to send marketing messages. Confirm
the intended approach against current ACMA guidance and applicable law
before enabling sending.

References: - https://www.acma.gov.au/avoid-sending-spam -
https://www.legislation.gov.au/ -
https://www.linkedin.com/legal/user-agreement

## 14. Security and privacy

-   Keep API keys server-side in environment variables or a managed
    secrets service.
-   Never expose secrets in frontend code.
-   Require authentication and appropriate database access controls.
-   Restrict personal contact data access.
-   Encrypt traffic and use secured storage.
-   Keep audit logs for important actions.
-   Support correction and deletion requests.
-   Define retention rules for stale leads and contact data.
-   Avoid storing unnecessary sensitive information.
-   Separate development and production credentials.
-   Back up the database and test recovery.

## 15. Validation and metrics

Track the full funnel: - Discovered lead - Qualified lead - Accepted
lead - Contacted (where permitted) - Meaningful response - Meeting
booked - Proposal sent - Won/lost - Revenue and gross profit

Primary measures: - Percentage of candidates accepted by Alysia -
Percentage plausibly meeting A\$2,000 - Cost per qualified lead - Time
spent reviewing leads - Positive responses and qualified conversations -
Proposal and booking rates - Average project value - Gross profit by
segment and source - Repeat business - Source-to-sale conversion

Do not optimise for lead count or email opens as the primary outcome.

### Evaluation set

Review the first 50--100 candidates where possible. Label relevance,
evidence validity, segment, recommended service and commercial
plausibility.

Proposed initial quality gates: - At least 90% of high-priority leads
have valid supporting evidence. - At least 80% of high-priority leads
are judged relevant by a human reviewer. - Fewer than 5% duplicate leads
in reviewed output. - No unsupported factual claims or fabricated
contact details in approved drafts. - No messages sent without passing
permission and approval controls.

These are acceptance targets to test, not performance guarantees.

## 16. Build plan

### Phase 0 --- Confirm commercial inputs

-   Confirm actual service packages and pricing.
-   Define direct delivery, travel and setup cost assumptions.
-   Confirm national photographer coverage and capacity.
-   Identify any existing client examples and early wins.
-   Define approved service claims and turnaround times.

**Deliverable:** Commercial ruleset and service catalogue.

### Phase 1 --- CRM and dashboard

-   Create repository and project structure.
-   Configure database, authentication and migrations.
-   Implement company, contact, lead, activity and source models.
-   Build opportunity list and detail views.
-   Add manual lead entry and outcome tracking.

**Deliverable:** Usable sales workspace.

### Phase 2 --- Discovery

-   Integrate two or three permitted research sources.
-   Extract buying signals and source references.
-   Implement company resolution, freshness and deduplication.
-   Add scheduled runs, logging and source controls.

**Deliverable:** Repeatable candidate discovery.

### Phase 3 --- Qualification

-   Implement the A\$2,000 commercial gate.
-   Add corporate and individual scoring.
-   Add configurable pricing assumptions and strategic exceptions.
-   Add evidence-backed LLM qualification and service recommendations.
-   Validate structured outputs.

**Deliverable:** Prioritised, commercially assessed opportunities.

### Phase 4 --- Outreach support

-   Generate editable drafts for each target segment.
-   Test message variants focused on scheduling convenience, consistency
    and multi-location delivery.
-   Add approval, suppression and permission checks.
-   Keep sending disabled until controls are reviewed and tested.

**Deliverable:** Controlled outreach assistant.

### Phase 5 --- Pilot and evaluation

-   Review 50--100 candidates where feasible.
-   Track lead acceptance and actual outcomes.
-   Compare segments and source quality.
-   Measure costs and time saved.
-   Adjust scoring with documented changes.

**Deliverable:** Evidence-based decisions on what to scale.

## 17. Cost assumptions

Indicative monthly costs in AUD for a lean internal MVP: -
Hosting/database: A\$0--70 - Search/source APIs: A\$20--150 - LLM usage:
A\$10--80 - Monitoring/miscellaneous: A\$0--30 - Total indicative range:
A\$30--330/month

These are planning estimates, not vendor quotes. Licensed contact data,
higher research volume and production requirements may increase costs.
Set a monthly budget, cache results, limit LLM calls and stop runs when
configured spending limits are reached.

Estimated implementation effort: approximately 40--80 hours for a
focused MVP, depending on developer familiarity, provider access,
integration complexity and production requirements.

## 18. Immediate next-stage tasks

1.  Confirm service catalogue, pricing inputs and direct delivery costs.
2.  Verify the website's current service claims and turnaround
    commitments.
3.  Decide initial Melbourne geographic boundaries.
4.  Choose the first two or three research sources.
5.  Create the repository and database schema.
6.  Build manual CRM and opportunity review before automating discovery.
7.  Implement one vertical slice: one source → one signal → one
    qualified lead → one dashboard record.
8.  Test with real candidates and Alysia's judgement.
9.  Add outreach drafting only after evidence quality is satisfactory.
10. Review the first outcomes before expanding nationally or adding more
    providers.

## 19. Definition of success

The initial release succeeds when it consistently identifies
evidence-backed opportunities that Alysia considers worth pursuing,
estimates whether the project is likely to meet the A\$2,000 minimum,
and supports a controlled process for turning those opportunities into
qualified conversations.

The strategic advantage should emerge from better targeting, reliable
evidence, efficient scheduling-focused positioning and learning from
actual sales---not from AI-generated lead volume alone.
