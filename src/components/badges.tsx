import { label } from './format';

const STATE: Record<string, string> = {
  qualified: 'bg-success-container text-on-success-container',
  strategic_exception: 'bg-warning-container text-on-warning-container',
  below_threshold: 'bg-surface-variant text-on-surface-variant',
  needs_research: 'bg-tertiary-container text-on-tertiary-container',
};
const BAND: Record<string, string> = {
  high: 'bg-success-container text-on-success-container',
  review: 'bg-tertiary-container text-on-tertiary-container',
  research: 'bg-warning-container text-on-warning-container',
  ignore: 'bg-surface-variant text-on-surface-variant',
};
const BAND_LABEL: Record<string, string> = { high: 'high', review: 'review', research: 'needs research', ignore: "don't pursue" };

export function StateBadge({ state }: { state: string }) {
  return <span className={`badge ${STATE[state] ?? 'bg-surface-variant text-on-surface-variant'}`}>{label(state)}</span>;
}
export function BandBadge({ band }: { band: string }) {
  return <span className={`badge ${BAND[band] ?? 'bg-surface-variant text-on-surface-variant'}`}>{BAND_LABEL[band] ?? band}</span>;
}
export function StatusBadge({ status }: { status: string }) {
  return <span className="badge border border-outline-variant bg-surface-container-high text-on-surface-variant">{status}</span>;
}
