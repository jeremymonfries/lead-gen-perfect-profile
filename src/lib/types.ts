export type LeadType = 'corporate' | 'executive' | 'individual';
export type LeadSource = 'linkedin' | 'referral' | 'website' | 'asx' | 'news' | 'other';
export type LeadStatus = 'new' | 'researching' | 'contacted' | 'meeting' | 'proposal' | 'won' | 'lost' | 'nurture' | 'dismissed';
export type CommercialState = 'qualified' | 'strategic_exception' | 'below_threshold' | 'needs_research';
export type SignalType = 'tender' | 'rebrand' | 'new_office' | 'hiring' | 'exec_appointment' | 'merger' | 'graduate_intake' | 'onboarding' | 'event' | 'business_launch' | 'team_page' | 'other';
export type DateConfidence = 'exact' | 'approximate' | 'unknown';
export type ActivityType = 'created' | 'status_changed' | 'reviewed' | 'contacted' | 'replied' | 'meeting_booked' | 'proposal_sent' | 'won' | 'lost' | 'note' | 'draft_generated' | 'draft_copied' | 'updated';

export interface Company { id: string; name: string; domain: string | null; industry: string | null; employee_range: string | null; city: string | null; state: string | null; abn: string | null; office_count: number | null; created_at: string; updated_at: string; }
export interface Contact { id: string; company_id: string | null; name: string; title: string | null; email: string | null; phone: string | null; linkedin_url: string | null; source_note: string | null; verified: boolean; do_not_contact: boolean; created_at: string; updated_at: string; }
export interface ScoreBreakdown { signal: number; viability: number; fit: number; timing: number; evidence: number; total: number; notes: string[]; }
export interface Lead { id: string; owner_id: string; company_id: string | null; contact_id: string | null; lead_type: LeadType; source: LeadSource; status: LeadStatus; title: string; notes: string | null; est_headcount: number | null; est_locations: number | null; est_value_low: number | null; est_value_high: number | null; value_is_manual: boolean; assumptions: string | null; exception_reason: string | null; commercial_state: CommercialState; score: number | null; score_breakdown: ScoreBreakdown | null; recommended_service: string | null; next_action: string | null; actual_revenue: number | null; created_at: string; updated_at: string; }
export interface Signal { id: string; company_id: string | null; signal_type: SignalType; source_url: string | null; published_at: string | null; date_confidence: DateConfidence; discovered_at: string; summary: string; expires_at: string | null; created_at: string; }
export interface LeadSignal { lead_id: string; signal_id: string; contribution: number | null; }
export interface Activity { id: string; lead_id: string; user_id: string; activity_type: ActivityType; detail: string | null; metadata: Record<string, unknown> | null; created_at: string; }
export interface OutreachDraft { id: string; lead_id: string; channel: 'email' | 'linkedin'; subject: string | null; body: string; evidence_refs: string[]; created_by: string; created_at: string; copied_at: string | null; }
export interface Settings {
  target_value: number;            // 2000
  floor_value: number;             // 1400
  headcount_for_target: number;    // 15 (placeholder)
  headcount_for_floor: number;     // 10 (placeholder)
  price_base_fee: number | null;   // unknown until pricing confirmed
  price_per_head: number | null;
  score_bands: { high: number; review: number; research: number }; // 80, 65, 45
  llm_models: { discovery: string; drafts: string }; // Claude model per job (see LLM_MODELS)
  freshness_days: Record<SignalType, number>;
  service_catalogue: { id: string; name: string; description: string }[];
  approved_claims: string[];
  discovery_queries: string[];     // news search queries (Brave; only used when a key is set)
  discovery_feeds: { name: string; url: string }[]; // RSS/Atom feeds checked on every run
  discovery_keywords: string[];    // feed items must match one of these before Claude sees them
}
export interface LeadWithRelations extends Lead { company: Company | null; contact: Contact | null; signals: (Signal & { contribution: number | null })[]; }
export type LocationMatch = 'melbourne' | 'australia_other' | 'outside_australia' | 'unknown';
export type CandidateStatus = 'pending' | 'accepted' | 'rejected' | 'filtered';
export type OriginType = 'search' | 'rss';
export type PersonRole = 'appointee' | 'new_partner' | 'departing' | 'spokesperson' | 'other';
export interface CandidatePerson { name: string; title: string | null; role: PersonRole; }
export interface DiscoveryRun { id: string; source: string; status: 'running' | 'completed' | 'failed'; started_at: string; finished_at: string | null; queries: string[]; results_found: number; candidates_created: number; search_requests: number; llm_calls: number; feeds_checked: number; feed_items: number; prefiltered_out: number; errors: string[]; }
export interface DiscoveryCandidate { id: string; run_id: string | null; url: string; url_key: string; headline: string; snippet: string | null; publisher: string | null; published_at: string | null; query: string | null; origin_type: OriginType; people: CandidatePerson[]; signal_type: SignalType | null; company_name: string | null; company_domain: string | null; city: string | null; state: string | null; location_match: LocationMatch; est_headcount: number | null; summary: string; rationale: string | null; status: CandidateStatus; reject_reason: string | null; lead_id: string | null; reviewed_at: string | null; created_at: string; }
