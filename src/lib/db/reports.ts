import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { ReportActivity, ReportLead } from '@/lib/reports/outcomes';
import type { ReportCandidate, ReportUsage } from '@/lib/reports/discovery';

const LIMIT = 10000;
const fail = (ctx: string, e: { message: string }): never => { throw new Error(`${ctx}: ${e.message}`); };

type SigRow = { signal_type: string; published_at: string | null; discovered_at: string };

export interface ReportData { leads: ReportLead[]; activities: ReportActivity[]; candidates: ReportCandidate[]; usage: ReportUsage[] }

/** All data for the Outcomes report (owner-scoped by RLS). Period filtering happens in the pure aggregation. */
export async function loadReportData(): Promise<ReportData> {
  const db = await createClient();
  const [leadsR, actsR, candR, useR] = await Promise.all([
    db.from('leads').select('id,title,source,lead_type,status,commercial_state,score,est_value_low,est_value_high,actual_revenue,created_at,lead_signals(signal:signals(signal_type,published_at,discovered_at))').limit(LIMIT),
    db.from('activities').select('lead_id,activity_type,metadata,created_at').in('activity_type', ['status_changed', 'won', 'lost', 'contacted', 'meeting_booked', 'proposal_sent']).limit(LIMIT),
    db.from('discovery_candidates').select('status,origin_type,query,lead_id,created_at').limit(LIMIT),
    db.from('llm_usage').select('job,cost_usd,created_at').limit(LIMIT),
  ]);
  if (leadsR.error) fail('reports leads', leadsR.error);
  if (actsR.error) fail('reports activities', actsR.error);
  if (candR.error) fail('reports candidates', candR.error);
  if (useR.error) fail('reports usage', useR.error);

  const when = (s: SigRow) => s.published_at ?? s.discovered_at;
  const leads = ((leadsR.data ?? []) as unknown as (Omit<ReportLead, 'signal_type'> & { lead_signals: { signal: SigRow | null }[] | null })[]).map(({ lead_signals, ...l }) => {
    const latest = (lead_signals ?? []).map((x) => x.signal).filter((x): x is SigRow => !!x).sort((a, b) => when(b).localeCompare(when(a)))[0];
    return { ...l, signal_type: latest?.signal_type ?? null };
  });
  const activities: ReportActivity[] = (actsR.data ?? []).map((a) => ({
    lead_id: a.lead_id as string, activity_type: a.activity_type as string, created_at: a.created_at as string,
    to: typeof (a.metadata as { to?: unknown } | null)?.to === 'string' ? ((a.metadata as { to: string }).to) : null,
  }));
  return {
    leads, activities,
    candidates: (candR.data ?? []) as ReportCandidate[],
    usage: (useR.data ?? []).map((u) => ({ job: u.job as string, cost_usd: Number(u.cost_usd) || 0, created_at: u.created_at as string })),
  };
}
