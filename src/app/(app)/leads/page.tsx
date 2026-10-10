import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { listLeads, getSettings } from '@/lib/db';
import { scoreBand } from '@/lib/scoring';
import type { CommercialState, LeadSource, LeadStatus, LeadType } from '@/lib/types';
import { StateBadge, BandBadge, StatusBadge } from '@/components/badges';
import { COMMERCIAL_STATES, LEAD_TYPES, SOURCES, STATUSES, fmtAUD, fmtDate, fmtRange, label } from '@/components/format';

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
const MAX_ROWS = 100;

export default async function LeadsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireUser();
  const sp = await searchParams;
  const minScore = one(sp.min_score);
  const filters = {
    status: one(sp.status) as LeadStatus | undefined,
    source: one(sp.source) as LeadSource | undefined,
    commercial_state: one(sp.commercial_state) as CommercialState | undefined,
    lead_type: one(sp.lead_type) as LeadType | undefined,
    min_score: minScore && Number.isFinite(Number(minScore)) ? Number(minScore) : undefined,
    q: one(sp.q),
  };
  const [all, leads, settings] = await Promise.all([listLeads(), listLeads(filters), getSettings()]);
  const shown = leads.slice(0, MAX_ROWS);

  const prioritised = all.filter((l) => l.commercial_state === 'qualified' || l.commercial_state === 'strategic_exception').length;
  const awaiting = all.filter((l) => l.status === 'new').length;
  const won = all.filter((l) => l.status === 'won');
  const actual = won.reduce((s, l) => s + (l.actual_revenue ?? 0), 0);
  const hasFilter = Object.values(filters).some((v) => v !== undefined);

  const sel = (name: string, opts: readonly string[], cur?: string) => (
    <select name={name} defaultValue={cur ?? ''} className="input" aria-label={name}>
      <option value="">{label(name)}: any</option>
      {opts.map((o) => <option key={o} value={o}>{label(o)}</option>)}
    </select>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Leads</h1>
        <Link href="/leads/new" className="btn btn-primary">New lead</Link>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="card"><div className="text-xs text-gray-500">Priority queue (qualified + strategic exception)</div><div className="text-2xl font-semibold">{prioritised}</div></div>
        <div className="card"><div className="text-xs text-gray-500">Awaiting review (status new)</div><div className="text-2xl font-semibold">{awaiting}</div></div>
        <div className="card"><div className="text-xs text-gray-500">Won leads</div><div className="text-2xl font-semibold">{won.length}</div></div>
        <div className="card"><div className="text-xs text-gray-500">Actual revenue (won, recorded actuals)</div><div className="text-2xl font-semibold">{fmtAUD(actual)}</div></div>
      </div>
      <p className="text-xs text-gray-500">Values in the table below are estimates (A$), not actuals, until a lead is won and revenue is recorded.</p>

      <form method="get" className="card grid grid-cols-2 gap-2 md:grid-cols-7">
        <input name="q" defaultValue={filters.q} placeholder="Search…" className="input col-span-2 md:col-span-2" />
        {sel('status', STATUSES, filters.status)}
        {sel('source', SOURCES, filters.source)}
        {sel('commercial_state', COMMERCIAL_STATES, filters.commercial_state)}
        {sel('lead_type', LEAD_TYPES, filters.lead_type)}
        <input name="min_score" type="number" min={0} max={100} defaultValue={filters.min_score} placeholder="Min score" className="input" />
        <div className="col-span-2 flex gap-2 md:col-span-7">
          <button className="btn btn-primary" type="submit">Filter</button>
          {hasFilter && <Link href="/leads" className="btn">Clear</Link>}
        </div>
      </form>

      {shown.length === 0 ? (
        <div className="card text-center text-gray-600">
          {hasFilter ? 'No leads match these filters.' : 'No leads yet.'}{' '}
          <Link href="/leads/new" className="link">Add a new lead</Link>
        </div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="tbl">
            <thead><tr><th>Lead</th><th>City</th><th>Type</th><th>Source</th><th>Latest signal</th><th>Score</th><th>Commercial</th><th>Est. value (AUD)</th><th>Service</th><th>Status</th></tr></thead>
            <tbody>
              {shown.map((l) => {
                const sig = l.latest_signal;
                return (
                  <tr key={l.id}>
                    <td><Link href={`/leads/${l.id}`} className="link font-medium">{l.title}</Link>{l.company && <div className="text-xs text-gray-500">{l.company.name}</div>}</td>
                    <td>{l.company?.city ?? '—'}</td>
                    <td>{l.lead_type}</td>
                    <td>{l.source}</td>
                    <td>{sig ? <>{label(sig.signal_type)}<div className="text-xs text-gray-500">{fmtDate(sig.published_at)}</div></> : '—'}</td>
                    <td>{l.score == null ? '—' : <span className="whitespace-nowrap">{l.score} <BandBadge band={scoreBand(l.score, settings)} /></span>}</td>
                    <td><StateBadge state={l.commercial_state} /></td>
                    <td className="whitespace-nowrap">{fmtRange(l.est_value_low, l.est_value_high)}</td>
                    <td>{l.recommended_service ?? '—'}</td>
                    <td><StatusBadge status={l.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {leads.length > MAX_ROWS && <p className="text-xs text-gray-500">Showing first {MAX_ROWS} of {leads.length}. Narrow with filters.</p>}
    </div>
  );
}
