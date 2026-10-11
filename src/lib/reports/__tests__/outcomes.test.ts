import { describe, expect, it } from 'vitest';
import { buildOutcomes, median, periodStart, stageReached, variance, type ReportActivity, type ReportLead } from '../outcomes';
import { buildDiscoveryReport } from '../discovery';

const bands = { high: 80, review: 65, research: 45 };
const NOW = new Date('2026-10-11T02:00:00Z');

let n = 0;
const lead = (o: Partial<ReportLead> = {}): ReportLead => ({
  id: `l${++n}`, title: `Lead ${n}`, source: 'news', lead_type: 'corporate', status: 'new', commercial_state: 'qualified', score: 70,
  est_value_low: null, est_value_high: null, actual_revenue: null, created_at: '2026-09-01T00:00:00Z', signal_type: 'rebrand', ...o,
});
const act = (lead_id: string, to: string): ReportActivity => ({ lead_id, activity_type: 'status_changed', to, created_at: '2026-09-02T00:00:00Z' });

describe('stageReached', () => {
  it('uses current status', () => {
    expect(stageReached({ id: 'a', status: 'meeting' }, [])).toBe(2);
    expect(stageReached({ id: 'a', status: 'new' }, [])).toBe(0);
    expect(stageReached({ id: 'a', status: 'nurture' }, [])).toBe(0);
  });
  it('won implies all earlier stages', () => {
    expect(stageReached({ id: 'a', status: 'won' }, [])).toBe(4);
  });
  it('lost after proposal keeps proposal', () => {
    expect(stageReached({ id: 'a', status: 'lost' }, [act('a', 'contacted'), act('a', 'proposal'), act('a', 'lost')])).toBe(3);
  });
  it('lost with no history reached nothing', () => {
    expect(stageReached({ id: 'a', status: 'lost' }, [act('a', 'lost')])).toBe(0);
  });
});

describe('buildOutcomes', () => {
  const leads = [
    lead({ id: 'a', source: 'news', status: 'won', est_value_low: 1000, est_value_high: 2000, actual_revenue: 1800, score: 85 }),
    lead({ id: 'b', source: 'news', status: 'lost', score: 50 }),
    lead({ id: 'c', source: 'referral', status: 'contacted', score: null, signal_type: null }),
    lead({ id: 'd', source: 'referral', status: 'dismissed', score: 10 }),
  ];
  const acts = [act('b', 'contacted'), act('b', 'meeting'), act('b', 'proposal')];
  const r = buildOutcomes(leads, acts, bands, 'all', NOW);

  it('groups by source with funnel counts', () => {
    const news = r.groups.source.find((g) => g.key === 'news')!;
    expect(news).toMatchObject({ leads: 2, contacted: 2, meetings: 2, proposals: 2, won: 1, lost: 1, open: 0, winRate: 0.5, contactToWin: 0.5, revenue: 1800, estimateForWon: 1500, avgDeal: 1800 });
    const ref = r.groups.source.find((g) => g.key === 'referral')!;
    expect(ref).toMatchObject({ leads: 2, contacted: 1, won: 0, lost: 0, open: 1, winRate: null, avgDeal: null });
  });
  it('groups by score band incl. unscored and signal none', () => {
    expect(r.groups.score_band.map((g) => g.key).sort()).toEqual(['high', 'ignore', 'research', 'unscored']);
    expect(r.groups.signal_type.some((g) => g.key === 'none')).toBe(true);
  });
  it('flags low samples (<5 closed)', () => {
    expect(r.groups.source.every((g) => g.lowSample)).toBe(true);
    const many = Array.from({ length: 5 }, () => lead({ status: 'lost' }));
    expect(buildOutcomes(many, [], bands, 'all', NOW).totals.lowSample).toBe(false);
  });
  it('computes totals, won detail and median variance', () => {
    expect(r.totals.leads).toBe(4);
    expect(r.closed).toBe(2);
    expect(r.won).toHaveLength(1);
    expect(r.won[0].variance).toBeCloseTo(0.2);
    expect(r.medianVariance).toBeCloseTo(0.2);
  });
  it('variance null without estimate; median handles even/empty', () => {
    expect(variance(100, null)).toBeNull();
    expect(variance(80, 100)).toBeCloseTo(-0.2);
    expect(median([])).toBeNull();
    expect(median([3, 1, 2, 10])).toBe(2.5);
    const nr = buildOutcomes([lead({ status: 'won', actual_revenue: 500 })], [], bands, 'all', NOW);
    expect(nr.medianVariance).toBeNull();
    expect(nr.totals.winRate).toBe(1);
  });
});

describe('period filter', () => {
  it('fy starts 1 July Melbourne time', () => {
    const june30 = lead({ created_at: '2026-06-30T03:00:00Z' }); // 30 Jun 13:00 AEST
    const jul1 = lead({ created_at: '2026-07-01T03:00:00Z' });   // 1 Jul 13:00 AEST
    const r = buildOutcomes([june30, jul1], [], bands, 'fy', NOW);
    expect(r.totals.leads).toBe(1);
  });
  it('fy before July uses previous year', () => {
    const start = periodStart('fy', new Date('2026-03-15T00:00:00Z'))!;
    expect(new Date(start).toISOString()).toBe('2025-06-30T14:00:00.000Z');
  });
  it('month and 90d', () => {
    const ls = [lead({ created_at: '2026-10-02T00:00:00Z' }), lead({ created_at: '2026-09-20T00:00:00Z' }), lead({ created_at: '2026-05-01T00:00:00Z' })];
    expect(buildOutcomes(ls, [], bands, 'month', NOW).totals.leads).toBe(1);
    expect(buildOutcomes(ls, [], bands, '90d', NOW).totals.leads).toBe(2);
    expect(buildOutcomes(ls, [], bands, 'all', NOW).totals.leads).toBe(3);
  });
});

describe('buildDiscoveryReport', () => {
  const cand = (o: Partial<{ status: string; origin_type: string; query: string | null; lead_id: string | null; created_at: string }>) =>
    ({ status: 'pending', origin_type: 'rss', query: 'Campaign Brief', lead_id: null, created_at: '2026-09-10T00:00:00Z', ...o });
  const leadsOut = [{ id: 'w', status: 'won', actual_revenue: 3000 }, { id: 'o', status: 'contacted', actual_revenue: null }];
  const usage = [
    { job: 'discovery', cost_usd: 1, created_at: '2026-09-10T00:00:00Z' },
    { job: 'draft', cost_usd: 0.5, created_at: '2026-09-10T00:00:00Z' },
    { job: 'discovery', cost_usd: 9, created_at: '2025-01-01T00:00:00Z' },
  ];
  const cands = [
    cand({ status: 'accepted', lead_id: 'w' }), cand({ status: 'accepted', lead_id: 'o' }), cand({ status: 'rejected' }), cand({ status: 'filtered' }),
    cand({ origin_type: 'search', query: 'law firm partner', status: 'accepted' }),
  ];
  it('computes per-origin and cost metrics', () => {
    const r = buildDiscoveryReport(cands, leadsOut, usage, '90d', NOW);
    const cb = r.origins.find((o) => o.origin === 'Campaign Brief')!;
    expect(cb).toMatchObject({ found: 3, accepted: 2, rejected: 1, won: 1, revenue: 3000 });
    expect(cb.acceptanceRate).toBeCloseTo(2 / 3);
    expect(r.origins.find((o) => o.origin === 'Search news')!.found).toBe(1);
    expect(r.total.accepted).toBe(3);
    expect(r.spendUsd).toBeCloseTo(1.5);
    expect(r.costPerAcceptedUsd).toBeCloseTo(1 / 3);
    expect(r.revenuePerUsd).toBeCloseTo(2000);
  });
  it('null when no revenue or accepted', () => {
    const r = buildDiscoveryReport([cand({ status: 'rejected' })], [], usage, 'all', NOW);
    expect(r.costPerAcceptedUsd).toBeNull();
    expect(r.revenuePerUsd).toBeNull();
    expect(r.origins[0].acceptanceRate).toBe(0);
  });
});
