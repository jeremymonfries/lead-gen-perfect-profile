import { scoreBand } from '@/lib/scoring';
import type { Settings } from '@/lib/types';

export type Period = 'all' | '90d' | 'fy' | 'month';
export const PERIODS: { id: Period; label: string }[] = [
  { id: 'all', label: 'All time' },
  { id: '90d', label: 'Last 90 days' },
  { id: 'fy', label: 'This financial year' },
  { id: 'month', label: 'This month' },
];
export const parsePeriod = (v: string | undefined): Period => (PERIODS.some((p) => p.id === v) ? (v as Period) : 'all');

export const MIN_CLOSED_FOR_SAMPLE = 5;
const DAY_MS = 86_400_000;
const MEL = 'Australia/Melbourne';

export interface ReportLead {
  id: string; title: string; source: string; lead_type: string; status: string; commercial_state: string;
  score: number | null; est_value_low: number | null; est_value_high: number | null; actual_revenue: number | null;
  created_at: string; signal_type: string | null;
}
/** status_changed / won / lost (and contacted etc.) activities; `to` is metadata.to for status_changed. */
export interface ReportActivity { lead_id: string; activity_type: string; to: string | null; created_at: string }

/** Funnel stages in order. Index = rank. */
export const STAGES = ['created', 'contacted', 'meeting', 'proposal', 'won'] as const;
const STAGE_RANK: Record<string, number> = { created: 0, contacted: 1, meeting: 2, proposal: 3, won: 4 };
const ACTIVITY_RANK: Record<string, number> = { contacted: 1, meeting_booked: 2, proposal_sent: 3, won: 4 };

const melParts = (d: Date) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-AU', { timeZone: MEL, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, Number(x.value)]));
  return { y: p.year, m: p.month, d: p.day, h: p.hour };
};

/** Instant of local midnight on the 1st of month `m` (1-12) in Melbourne. */
function melMonthStart(y: number, m: number): number {
  for (const off of [10, 11]) {
    const t = Date.UTC(y, m - 1, 1) - off * 3_600_000;
    const p = melParts(new Date(t));
    if (p.d === 1 && p.h === 0) return t;
  }
  return Date.UTC(y, m - 1, 1) - 10 * 3_600_000;
}

/** Start of the period (ms), or null for all time. Financial year starts 1 July (Melbourne time). */
export function periodStart(period: Period, now = new Date()): number | null {
  if (period === 'all') return null;
  if (period === '90d') return now.getTime() - 90 * DAY_MS;
  const { y, m } = melParts(now);
  if (period === 'month') return melMonthStart(y, m);
  return melMonthStart(m >= 7 ? y : y - 1, 7);
}
export const inPeriod = (iso: string, start: number | null) => start == null || Date.parse(iso) >= start;

export function stageReached(lead: Pick<ReportLead, 'id' | 'status'>, acts: ReportActivity[]): number {
  let r = STAGE_RANK[lead.status] ?? 0;
  for (const a of acts) {
    if (a.activity_type === 'status_changed' && a.to) r = Math.max(r, STAGE_RANK[a.to] ?? 0);
    else r = Math.max(r, ACTIVITY_RANK[a.activity_type] ?? 0);
  }
  return r;
}

export interface GroupRow {
  key: string; leads: number; contacted: number; meetings: number; proposals: number; won: number; lost: number; open: number;
  winRate: number | null; contactToWin: number | null; revenue: number; estimateForWon: number; avgDeal: number | null; lowSample: boolean;
}
export interface WonRow {
  id: string; title: string; source: string; low: number | null; high: number | null; mid: number | null; actual: number | null; variance: number | null;
}
export type GroupBy = 'source' | 'lead_type' | 'commercial_state' | 'score_band' | 'signal_type';
export interface OutcomesReport {
  totals: GroupRow; groups: Record<GroupBy, GroupRow[]>; won: WonRow[]; medianVariance: number | null; closed: number;
}

export const midpoint = (low: number | null, high: number | null): number | null =>
  low != null && high != null ? (low + high) / 2 : low ?? high ?? null;
export const variance = (actual: number | null, mid: number | null): number | null =>
  actual == null || mid == null || mid === 0 ? null : (actual - mid) / mid;
export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const h = s.length >> 1;
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
}

interface Row { lead: ReportLead; rank: number }

function summarise(key: string, rows: Row[]): GroupRow {
  let contacted = 0, meetings = 0, proposals = 0, won = 0, lost = 0, open = 0, revenue = 0, estimateForWon = 0;
  for (const { lead, rank } of rows) {
    if (rank >= 1) contacted++;
    if (rank >= 2) meetings++;
    if (rank >= 3) proposals++;
    if (lead.status === 'won') {
      won++;
      revenue += lead.actual_revenue ?? 0;
      estimateForWon += midpoint(lead.est_value_low, lead.est_value_high) ?? 0;
    } else if (lead.status === 'lost') lost++;
    if (!['won', 'lost', 'dismissed'].includes(lead.status)) open++;
  }
  const closed = won + lost;
  return {
    key, leads: rows.length, contacted, meetings, proposals, won, lost, open,
    winRate: closed ? won / closed : null,
    contactToWin: contacted ? won / contacted : null,
    revenue, estimateForWon, avgDeal: won ? revenue / won : null,
    lowSample: closed < MIN_CLOSED_FOR_SAMPLE,
  };
}

export function buildOutcomes(
  allLeads: ReportLead[], activities: ReportActivity[], bands: Settings['score_bands'], period: Period, now = new Date(),
): OutcomesReport {
  const start = periodStart(period, now);
  const byLead = new Map<string, ReportActivity[]>();
  for (const a of activities) { const l = byLead.get(a.lead_id); if (l) l.push(a); else byLead.set(a.lead_id, [a]); }
  const rows: Row[] = allLeads.filter((l) => inPeriod(l.created_at, start)).map((lead) => ({ lead, rank: stageReached(lead, byLead.get(lead.id) ?? []) }));

  const keyOf: Record<GroupBy, (l: ReportLead) => string> = {
    source: (l) => l.source,
    lead_type: (l) => l.lead_type,
    commercial_state: (l) => l.commercial_state,
    score_band: (l) => (l.score == null ? 'unscored' : scoreBand(l.score, { score_bands: bands } as Settings)),
    signal_type: (l) => l.signal_type ?? 'none',
  };
  const groups = {} as Record<GroupBy, GroupRow[]>;
  for (const g of Object.keys(keyOf) as GroupBy[]) {
    const m = new Map<string, Row[]>();
    for (const r of rows) { const k = keyOf[g](r.lead); const l = m.get(k); if (l) l.push(r); else m.set(k, [r]); }
    groups[g] = [...m].map(([k, rs]) => summarise(k, rs)).sort((a, b) => b.leads - a.leads || a.key.localeCompare(b.key));
  }

  const won: WonRow[] = rows.filter((r) => r.lead.status === 'won').map(({ lead: l }) => {
    const mid = midpoint(l.est_value_low, l.est_value_high);
    return { id: l.id, title: l.title, source: l.source, low: l.est_value_low, high: l.est_value_high, mid, actual: l.actual_revenue, variance: variance(l.actual_revenue, mid) };
  });
  const totals = summarise('total', rows);
  return {
    totals, groups, won,
    medianVariance: median(won.map((w) => w.variance).filter((v): v is number => v != null)),
    closed: totals.won + totals.lost,
  };
}
