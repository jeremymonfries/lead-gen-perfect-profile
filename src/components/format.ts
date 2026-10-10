import type { SignalType } from '@/lib/types';

export const SIGNAL_TYPES: SignalType[] = ['tender', 'rebrand', 'new_office', 'hiring', 'exec_appointment', 'merger', 'graduate_intake', 'onboarding', 'event', 'business_launch', 'team_page', 'other'];
export const STATUSES = ['new', 'researching', 'contacted', 'meeting', 'proposal', 'won', 'lost', 'nurture', 'dismissed'] as const;
export const SOURCES = ['linkedin', 'referral', 'website', 'asx', 'news', 'other'] as const;
export const LEAD_TYPES = ['corporate', 'executive', 'individual'] as const;
export const COMMERCIAL_STATES = ['qualified', 'strategic_exception', 'below_threshold', 'needs_research'] as const;

const aud = new Intl.NumberFormat('en-AU', { maximumFractionDigits: 0 });
export const fmtAUD = (n: number | null | undefined) => (n == null ? '—' : `A$${aud.format(n)}`);
export function fmtRange(low: number | null, high: number | null): string {
  if (low == null && high == null) return '—';
  if (low == null || high == null || low === high) return fmtAUD(low ?? high);
  return `A$${aud.format(low)}–${aud.format(high)}`;
}
export function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}
export function fmtDateTime(d: string): string {
  return new Date(d).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
export const label = (s: string) => s.replace(/_/g, ' ');
