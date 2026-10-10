import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@/lib/settings-defaults';
import type { Lead, Settings, Signal } from '@/lib/types';
import { commercialGate, estimateValue, freshness, scoreBand, scoreLead } from '../index';

const S: Settings = DEFAULT_SETTINGS;
const NOW = new Date('2026-06-01T00:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

const sig = (o: Partial<Signal> = {}): Signal & { contribution: number | null } => ({
  id: 's', company_id: 'c', signal_type: 'tender', source_url: null, published_at: daysAgo(0), date_confidence: 'approximate',
  discovered_at: daysAgo(0), summary: '', expires_at: null, created_at: daysAgo(0), contribution: null, ...o,
});
const lead = (o: Partial<Lead> = {}): Lead => ({
  id: 'l', owner_id: 'u', company_id: null, contact_id: null, lead_type: 'corporate', source: 'other', status: 'new', title: 't', notes: null,
  est_headcount: null, est_locations: null, est_value_low: null, est_value_high: null, value_is_manual: false, assumptions: null, exception_reason: null,
  commercial_state: 'needs_research', score: null, score_breakdown: null, recommended_service: null, next_action: null, actual_revenue: null,
  created_at: '', updated_at: '', ...o,
});
const gateOf = (v: number | null, reason: string | null = null) =>
  commercialGate({ est_value_low: v, est_value_high: v, exception_reason: reason, lead_type: 'corporate', est_headcount: null }, S);

describe('freshness', () => {
  const f = (o: Partial<Signal>) => freshness({ signal_type: 'hiring', published_at: daysAgo(0), date_confidence: 'exact', ...o }, S, NOW);
  it('is 1 today and decays linearly', () => {
    expect(f({})).toBe(1);
    expect(f({ published_at: daysAgo(15) })).toBeCloseTo(0.5);
  });
  it('is 0 at and beyond the window (expired)', () => {
    expect(f({ published_at: daysAgo(30) })).toBe(0);
    expect(f({ published_at: daysAgo(200) })).toBe(0);
  });
  it('uses per-type windows', () => {
    expect(f({ signal_type: 'rebrand', published_at: daysAgo(45) })).toBeCloseTo(0.5);
  });
  it('is 0.5 for null date or unknown confidence', () => {
    expect(f({ published_at: null })).toBe(0.5);
    expect(f({ date_confidence: 'unknown' })).toBe(0.5);
  });
  it('is 1 for future dates (events)', () => {
    expect(f({ signal_type: 'event', published_at: daysAgo(-10) })).toBe(1);
  });
  it('defaults now to the current time', () => {
    expect(freshness({ signal_type: 'hiring', published_at: new Date().toISOString(), date_confidence: 'exact' }, S)).toBeGreaterThan(0.99);
  });
});

describe('estimateValue', () => {
  const e = (o: Partial<Pick<Lead, 'est_headcount' | 'est_locations' | 'lead_type'>>, s: Settings = S) =>
    estimateValue({ est_headcount: null, est_locations: null, lead_type: 'corporate', ...o }, s);
  it('proxy at floor headcount (10) and target headcount (15)', () => {
    expect(e({ est_headcount: 10 })).toMatchObject({ low: 1190, high: 1610, basis: 'headcount_proxy' });
    expect(e({ est_headcount: 15 })).toMatchObject({ low: 1700, high: 2300, basis: 'headcount_proxy' });
  });
  it('interpolates and extrapolates', () => {
    expect(e({ est_headcount: 12.5 }).low).toBe(Math.round(0.85 * 1700 / 10) * 10);
    const big = e({ est_headcount: 25 }); // v = 3200
    expect(big.low).toBe(2720);
    expect(big.high).toBe(3680);
  });
  it('clamps low at 0 for tiny headcounts', () => {
    const r = e({ est_headcount: 1 }); // v = 1400 - 9*120 = 320
    expect(r.low).toBeGreaterThanOrEqual(0);
    const z = e({ est_headcount: 1 }, { ...S, headcount_for_floor: 10, floor_value: 100, target_value: 2000 });
    expect(z.low).toBe(0);
    expect(z.high).toBe(0);
  });
  it('pricing path with base fee and per head', () => {
    const s = { ...S, price_base_fee: 500, price_per_head: 100 };
    expect(e({ est_headcount: 10 }, s)).toMatchObject({ low: 1500, high: 1500, basis: 'pricing' });
  });
  it('multiplies base fee per location', () => {
    const s = { ...S, price_base_fee: 500, price_per_head: 100 };
    expect(e({ est_headcount: 10, est_locations: 3 }, s).low).toBe(2500);
  });
  it('pricing without base fee treats base as 0', () => {
    expect(e({ est_headcount: 10 }, { ...S, price_per_head: 150 }).low).toBe(1500);
  });
  it('executive without headcount is manual', () => {
    expect(e({ lead_type: 'executive' })).toMatchObject({ low: null, high: null, basis: 'manual' });
  });
  it('executive with headcount uses proxy', () => {
    expect(e({ lead_type: 'executive', est_headcount: 15 }).basis).toBe('headcount_proxy');
  });
  it('unknown otherwise', () => {
    expect(e({})).toMatchObject({ low: null, high: null, basis: 'unknown' });
    expect(e({ est_headcount: 10 }, { ...S, price_per_head: null }).basis).toBe('headcount_proxy');
  });
  it('always supplies assumptions text', () => {
    for (const o of [{}, { est_headcount: 10 }, { lead_type: 'executive' as const }]) expect(e(o).assumptions.length).toBeGreaterThan(5);
  });
});

describe('commercialGate', () => {
  it('needs_research with no value', () => expect(gateOf(null)).toBe('needs_research'));
  it('qualified at exactly 2000 and above', () => {
    expect(gateOf(2000)).toBe('qualified');
    expect(gateOf(5000, 'x')).toBe('qualified');
  });
  it('1999 without reason is below_threshold', () => expect(gateOf(1999)).toBe('below_threshold'));
  it('exactly 1400 without reason is below_threshold', () => expect(gateOf(1400)).toBe('below_threshold'));
  it('exception at 1500 with reason, not without / blank', () => {
    expect(gateOf(1500, 'CEO relationship')).toBe('strategic_exception');
    expect(gateOf(1500)).toBe('below_threshold');
    expect(gateOf(1500, '   ')).toBe('below_threshold');
    expect(gateOf(1500, '')).toBe('below_threshold');
  });
  it('exception at exactly 1400 with reason', () => expect(gateOf(1400, 'r')).toBe('strategic_exception'));
  it('1399 is below_threshold even with reason', () => expect(gateOf(1399, 'r')).toBe('below_threshold'));
  it('uses midpoint of low/high', () => {
    const g = (lo: number | null, hi: number | null) => commercialGate({ est_value_low: lo, est_value_high: hi, exception_reason: null, lead_type: 'corporate', est_headcount: null }, S);
    expect(g(1700, 2300)).toBe('qualified');
    expect(g(1190, 1610)).toBe('below_threshold');
    expect(g(1900, 2000)).toBe('below_threshold');
    expect(g(2000, null)).toBe('qualified');
    expect(g(null, 1000)).toBe('below_threshold');
  });
});

describe('scoreBand', () => {
  it.each([[100, 'high'], [80, 'high'], [79, 'review'], [65, 'review'], [64, 'research'], [45, 'research'], [44, 'ignore'], [0, 'ignore']] as const)('%i -> %s', (t, b) => {
    expect(scoreBand(t, S)).toBe(b);
  });
});

describe('scoreLead', () => {
  const qualified = { est_value_low: 1700, est_value_high: 2300 };
  it('no signals: signal and timing zero', () => {
    const r = scoreLead(lead(qualified), [], S, NOW);
    expect(r.signal).toBe(0);
    expect(r.timing).toBe(0);
    expect(r.viability).toBe(25);
    expect(r.fit).toBe(20);
    expect(r.total).toBe(45);
  });
  it('fresh tender gives full signal and timing', () => {
    const r = scoreLead(lead(qualified), [sig()], S, NOW);
    expect(r.signal).toBe(25);
    expect(r.timing).toBe(15);
  });
  it('picks strongest weighted by freshness', () => {
    const r = scoreLead(lead(), [sig({ signal_type: 'tender', published_at: daysAgo(55) }), sig({ signal_type: 'hiring', published_at: daysAgo(0) })], S, NOW);
    // tender 25*(5/60)=2.08 ; hiring 20*1 = 20; +2 for extra fresh type
    expect(r.signal).toBe(22);
  });
  it('adds +2 per additional distinct fresh type, capped at 25', () => {
    const r = scoreLead(lead(), [sig({ signal_type: 'rebrand' }), sig({ signal_type: 'hiring' }), sig({ signal_type: 'merger' })], S, NOW);
    expect(r.signal).toBe(24);
    const capped = scoreLead(lead(), [sig({ signal_type: 'tender' }), sig({ signal_type: 'hiring' })], S, NOW);
    expect(capped.signal).toBe(25);
  });
  it('same type duplicated does not add bonus', () => {
    expect(scoreLead(lead(), [sig({ signal_type: 'rebrand' }), sig({ signal_type: 'rebrand' })], S, NOW).signal).toBe(20);
  });
  it('expired signals give 0 signal/timing and no bonus', () => {
    const r = scoreLead(lead(), [sig({ published_at: daysAgo(100) }), sig({ signal_type: 'hiring', published_at: daysAgo(100) })], S, NOW);
    expect(r.signal).toBe(0);
    expect(r.timing).toBe(0);
  });
  it('unknown date is neutral 0.5', () => {
    const r = scoreLead(lead(), [sig({ signal_type: 'tender', published_at: null, date_confidence: 'unknown' })], S, NOW);
    expect(r.signal).toBe(13); // round(12.5)
    expect(r.timing).toBe(8); // round(7.5)
  });
  it('future event counts as fully fresh', () => {
    const r = scoreLead(lead(), [sig({ signal_type: 'event', published_at: daysAgo(-5) })], S, NOW);
    expect(r.signal).toBe(12);
    expect(r.timing).toBe(15);
  });
  it('viability per gate state', () => {
    expect(scoreLead(lead(qualified), [], S, NOW).viability).toBe(25);
    expect(scoreLead(lead({ est_value_low: 1500, est_value_high: 1500, exception_reason: 'r' }), [], S, NOW).viability).toBe(18);
    expect(scoreLead(lead(), [], S, NOW).viability).toBe(8);
    expect(scoreLead(lead({ est_value_low: 500, est_value_high: 500 }), [], S, NOW).viability).toBe(0);
  });
  it('fit by lead type and multi-location penalty', () => {
    expect(scoreLead(lead({ lead_type: 'executive' }), [], S, NOW).fit).toBe(18);
    expect(scoreLead(lead({ lead_type: 'individual' }), [], S, NOW).fit).toBe(10);
    expect(scoreLead(lead({ est_locations: 3 }), [], S, NOW).fit).toBe(20);
    expect(scoreLead(lead({ est_locations: 4 }), [], S, NOW).fit).toBe(15);
    expect(scoreLead(lead({ lead_type: 'individual', est_locations: 10 }), [], S, NOW).fit).toBe(5);
  });
  it('evidence components and cap', () => {
    expect(scoreLead(lead(), [], S, NOW).evidence).toBe(0);
    expect(scoreLead(lead({ contact_id: 'x' }), [], S, NOW).evidence).toBe(4);
    expect(scoreLead(lead({ company_id: 'x' }), [], S, NOW).evidence).toBe(3);
    expect(scoreLead(lead(), [sig({ source_url: 'http://a' })], S, NOW).evidence).toBe(5);
    expect(scoreLead(lead(), [sig({ date_confidence: 'exact' })], S, NOW).evidence).toBe(3);
    const all = scoreLead(lead({ contact_id: 'x', company_id: 'y' }), [sig({ source_url: 'http://a', date_confidence: 'exact' })], S, NOW);
    expect(all.evidence).toBe(15);
  });
  it('total is the sum, integers, max 100, with notes', () => {
    const r = scoreLead(lead({ ...qualified, contact_id: 'x', company_id: 'y' }), [sig({ source_url: 'http://a', date_confidence: 'exact' })], S, NOW);
    expect(r.total).toBe(r.signal + r.viability + r.fit + r.timing + r.evidence);
    expect(r.total).toBe(100);
    for (const v of [r.signal, r.viability, r.fit, r.timing, r.evidence, r.total]) expect(Number.isInteger(v)).toBe(true);
    expect(r.notes.length).toBeGreaterThanOrEqual(5);
  });
});
