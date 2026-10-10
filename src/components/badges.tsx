import { label } from './format';

const STATE: Record<string, string> = {
  qualified: 'bg-green-100 text-green-800',
  strategic_exception: 'bg-amber-100 text-amber-800',
  below_threshold: 'bg-gray-200 text-gray-700',
  needs_research: 'bg-blue-100 text-blue-800',
};
const BAND: Record<string, string> = {
  high: 'bg-green-100 text-green-800',
  review: 'bg-blue-100 text-blue-800',
  research: 'bg-amber-100 text-amber-800',
  ignore: 'bg-gray-200 text-gray-700',
};
const BAND_LABEL: Record<string, string> = { high: 'high', review: 'review', research: 'needs research', ignore: "don't pursue" };

export function StateBadge({ state }: { state: string }) {
  return <span className={`badge ${STATE[state] ?? 'bg-gray-100 text-gray-700'}`}>{label(state)}</span>;
}
export function BandBadge({ band }: { band: string }) {
  return <span className={`badge ${BAND[band] ?? 'bg-gray-100'}`}>{BAND_LABEL[band] ?? band}</span>;
}
export function StatusBadge({ status }: { status: string }) {
  return <span className="badge bg-gray-100 text-gray-700 border border-gray-200">{status}</span>;
}
