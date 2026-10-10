import type { CommercialState, Lead, ScoreBreakdown, Settings, Signal, SignalType } from '@/lib/types';

const DAY_MS = 86_400_000;

const BASE_WEIGHTS: Record<SignalType, number> = {
  tender: 25,
  rebrand: 20,
  new_office: 20,
  hiring: 20,
  exec_appointment: 20,
  merger: 20,
  graduate_intake: 16,
  onboarding: 16,
  event: 12,
  business_launch: 12,
  team_page: 12,
  other: 8,
};

const round10 = (n: number) => Math.round(n / 10) * 10;
const money = (n: number) => `A$${Math.round(n).toLocaleString('en-AU')}`;

/** Freshness 0..1: max(0, 1 - age_days / window_days). Unknown age = 0.5; future dates = 1. */
export function freshness(signal: Pick<Signal, 'signal_type' | 'published_at' | 'date_confidence'>, settings: Settings, now: Date = new Date()): number {
  if (signal.published_at == null || signal.date_confidence === 'unknown') return 0.5;
  const published = new Date(signal.published_at).getTime();
  if (Number.isNaN(published)) return 0.5;
  const ageDays = (now.getTime() - published) / DAY_MS;
  if (ageDays <= 0) return 1;
  const window = settings.freshness_days[signal.signal_type];
  if (!(window > 0)) return 0;
  return Math.min(1, Math.max(0, 1 - ageDays / window));
}

export function estimateValue(lead: Pick<Lead, 'est_headcount' | 'est_locations' | 'lead_type'>, settings: Settings): { low: number | null; high: number | null; basis: 'pricing' | 'headcount_proxy' | 'manual' | 'unknown'; assumptions: string } {
  const headcount = lead.est_headcount;
  const known = headcount != null && headcount > 0;

  if (settings.price_per_head != null && known) {
    const locations = lead.est_locations != null && lead.est_locations > 1 ? lead.est_locations : 1;
    const base = (settings.price_base_fee ?? 0) * locations;
    const value = base + headcount * settings.price_per_head;
    return {
      low: value,
      high: value,
      basis: 'pricing',
      assumptions: `Pricing: ${money(settings.price_base_fee ?? 0)} base fee x ${locations} location(s) + ${headcount} heads x ${money(settings.price_per_head)} = ${money(value)}.`,
    };
  }

  if (lead.lead_type === 'executive' && !known) {
    return { low: null, high: null, basis: 'manual', assumptions: 'Executive/board shoot: value manually.' };
  }

  if (known) {
    const { headcount_for_floor: hf, headcount_for_target: ht, floor_value: fv, target_value: tv } = settings;
    const slope = ht !== hf ? (tv - fv) / (ht - hf) : 0;
    const v = Math.max(0, fv + (headcount - hf) * slope);
    return {
      low: Math.max(0, round10(0.85 * v)),
      high: round10(1.15 * v),
      basis: 'headcount_proxy',
      assumptions: `Headcount proxy: ${headcount} heads interpolated from ${hf} heads = ${money(fv)} to ${ht} heads = ${money(tv)} gives ~${money(v)}; range is -15%/+15%.`,
    };
  }

  return { low: null, high: null, basis: 'unknown', assumptions: 'Headcount and pricing unknown; needs research.' };
}

export function commercialGate(lead: Pick<Lead, 'est_value_low' | 'est_value_high' | 'exception_reason' | 'lead_type' | 'est_headcount'>, settings: Settings): CommercialState {
  const { est_value_low: lo, est_value_high: hi } = lead;
  const value = lo != null && hi != null ? (lo + hi) / 2 : (lo ?? hi);
  if (value == null) return 'needs_research';
  if (value >= settings.target_value) return 'qualified';
  if (value >= settings.floor_value) {
    return typeof lead.exception_reason === 'string' && lead.exception_reason.trim().length > 0 ? 'strategic_exception' : 'below_threshold';
  }
  return 'below_threshold';
}

export function scoreLead(lead: Lead, signals: (Signal & { contribution: number | null })[], settings: Settings, now: Date = new Date()): ScoreBreakdown {
  const notes: string[] = [];

  // Signal strength (max 25) and timing (max 15)
  const fresh = signals.map((s) => ({ s, f: freshness(s, settings, now) }));
  let signalScore = 0;
  let timing = 0;
  if (fresh.length === 0) {
    notes.push('Signal 0/25: no buying signals.');
    notes.push('Timing 0/15: no signals.');
  } else {
    let best = fresh[0];
    for (const x of fresh) if (BASE_WEIGHTS[x.s.signal_type] * x.f > BASE_WEIGHTS[best.s.signal_type] * best.f) best = x;
    const freshTypes = new Set(fresh.filter((x) => x.f > 0).map((x) => x.s.signal_type));
    const extra = Math.max(0, freshTypes.size - 1);
    signalScore = Math.min(25, Math.round(BASE_WEIGHTS[best.s.signal_type] * best.f + 2 * extra));
    notes.push(`Signal ${signalScore}/25: strongest is ${best.s.signal_type} (weight ${BASE_WEIGHTS[best.s.signal_type]} x freshness ${best.f.toFixed(2)})${extra ? `, +${2 * extra} for ${extra} other fresh signal type(s)` : ''}.`);
    const maxF = Math.max(...fresh.map((x) => x.f));
    timing = Math.min(15, Math.round(15 * maxF));
    notes.push(`Timing ${timing}/15: best freshness ${maxF.toFixed(2)}.`);
  }

  // Viability (max 25)
  const gate = commercialGate(lead, settings);
  const viability = { qualified: 25, strategic_exception: 18, needs_research: 8, below_threshold: 0 }[gate];
  notes.push(`Viability ${viability}/25: commercial gate is ${gate}.`);

  // Fit (max 20)
  let fit = { corporate: 20, executive: 18, individual: 10 }[lead.lead_type];
  const multi = lead.est_locations != null && lead.est_locations > 3;
  if (multi) fit = Math.max(0, fit - 5);
  notes.push(`Fit ${fit}/20: ${lead.lead_type} lead${multi ? ', -5 for more than 3 locations (delivery risk)' : ''}.`);

  // Evidence (max 15)
  const parts: string[] = [];
  let evidence = 0;
  if (signals.some((s) => s.source_url)) { evidence += 5; parts.push('source URL +5'); }
  if (signals.some((s) => s.date_confidence === 'exact')) { evidence += 3; parts.push('exact date +3'); }
  if (lead.contact_id) { evidence += 4; parts.push('contact identified +4'); }
  if (lead.company_id) { evidence += 3; parts.push('company linked +3'); }
  evidence = Math.min(15, evidence);
  notes.push(`Evidence ${evidence}/15: ${parts.length ? parts.join(', ') : 'none'}.`);

  return { signal: signalScore, viability, fit, timing, evidence, total: signalScore + viability + fit + timing + evidence, notes };
}

export function scoreBand(total: number, settings: Settings): 'high' | 'review' | 'research' | 'ignore' {
  const b = settings.score_bands;
  if (total >= b.high) return 'high';
  if (total >= b.review) return 'review';
  if (total >= b.research) return 'research';
  return 'ignore';
}
