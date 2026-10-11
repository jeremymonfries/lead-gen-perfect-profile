import { inPeriod, periodStart, type Period } from './outcomes';

export interface ReportCandidate { status: string; origin_type: string; query: string | null; lead_id: string | null; created_at: string }
export interface ReportLeadOutcome { id: string; status: string; actual_revenue: number | null }
export interface ReportUsage { job: string; cost_usd: number; created_at: string }

export const SEARCH_ORIGIN = 'Search news';
export interface OriginRow {
  origin: string; found: number; accepted: number; rejected: number; acceptanceRate: number | null; won: number; revenue: number;
}
export interface DiscoveryReport {
  origins: OriginRow[]; total: OriginRow; spendUsd: number; spendByJob: Record<string, number>;
  costPerAcceptedUsd: number | null; revenuePerUsd: number | null;
}

export const originOf = (c: Pick<ReportCandidate, 'origin_type' | 'query'>): string =>
  c.origin_type === 'search' ? SEARCH_ORIGIN : (c.query ?? 'Unknown feed').replace(/^feed:\s*/i, '');

function row(origin: string, cs: ReportCandidate[], leads: Map<string, ReportLeadOutcome>): OriginRow {
  let accepted = 0, rejected = 0, won = 0, revenue = 0;
  for (const c of cs) {
    if (c.status === 'accepted') accepted++;
    else if (c.status === 'rejected') rejected++;
    const lead = c.lead_id ? leads.get(c.lead_id) : undefined;
    if (c.status === 'accepted' && lead?.status === 'won') { won++; revenue += lead.actual_revenue ?? 0; }
  }
  const reviewed = accepted + rejected;
  return { origin, found: cs.length, accepted, rejected, acceptanceRate: reviewed ? accepted / reviewed : null, won, revenue };
}

/** Candidates Claude marked irrelevant ('filtered') are excluded from "found". Spend is all Claude jobs; cost per accepted uses discovery spend only. */
export function buildDiscoveryReport(
  allCandidates: ReportCandidate[], leadList: ReportLeadOutcome[], usage: ReportUsage[], period: Period, now = new Date(),
): DiscoveryReport {
  const start = periodStart(period, now);
  const cands = allCandidates.filter((c) => c.status !== 'filtered' && inPeriod(c.created_at, start));
  const leads = new Map(leadList.map((l) => [l.id, l]));
  const m = new Map<string, ReportCandidate[]>();
  for (const c of cands) { const k = originOf(c); const l = m.get(k); if (l) l.push(c); else m.set(k, [c]); }
  const origins = [...m].map(([k, cs]) => row(k, cs, leads)).sort((a, b) => b.found - a.found || a.origin.localeCompare(b.origin));
  const total = row('Total', cands, leads);

  const spendByJob: Record<string, number> = {};
  let spendUsd = 0;
  for (const u of usage) {
    if (!inPeriod(u.created_at, start)) continue;
    const c = Number(u.cost_usd) || 0;
    spendUsd += c;
    spendByJob[u.job] = (spendByJob[u.job] ?? 0) + c;
  }
  const discoverySpend = spendByJob.discovery ?? 0;
  return {
    origins, total, spendUsd, spendByJob,
    costPerAcceptedUsd: total.accepted ? discoverySpend / total.accepted : null,
    revenuePerUsd: total.revenue > 0 && spendUsd > 0 ? total.revenue / spendUsd : null,
  };
}
