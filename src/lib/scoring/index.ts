import type { CommercialState, Lead, ScoreBreakdown, Settings, Signal } from '@/lib/types';

/** Freshness 0..1: max(0, 1 - age_days / window_days). */
export function freshness(signal: Pick<Signal, 'signal_type' | 'published_at' | 'date_confidence'>, settings: Settings, now?: Date): number { void signal; void settings; void now; throw new Error('not implemented'); }
export function estimateValue(lead: Pick<Lead, 'est_headcount' | 'est_locations' | 'lead_type'>, settings: Settings): { low: number | null; high: number | null; basis: 'pricing' | 'headcount_proxy' | 'manual' | 'unknown'; assumptions: string } { void lead; void settings; throw new Error('not implemented'); }
export function commercialGate(lead: Pick<Lead, 'est_value_low' | 'est_value_high' | 'exception_reason' | 'lead_type' | 'est_headcount'>, settings: Settings): CommercialState { void lead; void settings; throw new Error('not implemented'); }
export function scoreLead(lead: Lead, signals: (Signal & { contribution: number | null })[], settings: Settings, now?: Date): ScoreBreakdown { void lead; void signals; void settings; void now; throw new Error('not implemented'); }
export function scoreBand(total: number, settings: Settings): 'high' | 'review' | 'research' | 'ignore' { void total; void settings; throw new Error('not implemented'); }
