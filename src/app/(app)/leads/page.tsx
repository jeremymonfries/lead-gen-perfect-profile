import { Suspense } from 'react';
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

export default function LeadsPage({ searchParams }: { searchParams: Promise<SP> }) {
  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1>Leads</h1>
          <p className="page-sub">Values in the table are estimates (A$), not actuals, until a lead is won and revenue is recorded.</p>
        </div>
        <div className="page-actions"><Link href="/leads/new" className="btn btn-primary">New lead</Link></div>
      </div>
      <Suspense fallback={<LeadsSkeleton />}>
        <LeadsContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function LeadsSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading leads">
      <div className="panel h-16 animate-pulse bg-surface-container-high" />
      <div className="panel h-16 animate-pulse bg-surface-container-high" />
      <div className="card h-64 animate-pulse bg-surface-container-high" />
    </div>
  );
}

async function LeadsContent({ searchParams }: { searchParams: Promise<SP> }) {
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
    <div className="space-y-6">
      <div className="kpi-strip">
        <div className="kpi"><div className="kpi-label">Priority queue</div><div className="kpi-value">{prioritised}</div><div className="kpi-sub">qualified + strategic exception</div></div>
        <div className="kpi"><div className="kpi-label">Awaiting review</div><div className="kpi-value">{awaiting}</div><div className="kpi-sub">status new</div></div>
        <div className="kpi"><div className="kpi-label">Won leads</div><div className="kpi-value">{won.length}</div></div>
        <div className="kpi"><div className="kpi-label">Actual revenue</div><div className="kpi-value">{fmtAUD(actual)}</div><div className="kpi-sub">won, recorded actuals</div></div>
      </div>

      <form method="get" className="panel grid grid-cols-2 items-center gap-2 sm:grid-cols-3 lg:grid-cols-[2fr_repeat(4,1fr)_8rem_auto]">
        <input name="q" defaultValue={filters.q} placeholder="Search…" aria-label="Search" className="input col-span-2 min-w-0 sm:col-span-3 lg:col-span-1" />
        <div className="min-w-0">{sel('status', STATUSES, filters.status)}</div>
        <div className="min-w-0">{sel('source', SOURCES, filters.source)}</div>
        <div className="min-w-0">{sel('commercial_state', COMMERCIAL_STATES, filters.commercial_state)}</div>
        <div className="min-w-0">{sel('lead_type', LEAD_TYPES, filters.lead_type)}</div>
        <input name="min_score" type="number" min={0} max={100} defaultValue={filters.min_score} placeholder="Min score" aria-label="Min score" className="input min-w-0" />
        <div className="col-span-2 flex gap-2 sm:col-span-3 lg:col-span-1">
          <button className="btn btn-tonal" type="submit">Filter</button>
          {hasFilter && <Link href="/leads" className="btn btn-text">Clear</Link>}
        </div>
      </form>

      {shown.length === 0 ? (
        <div className="panel text-center text-on-surface-variant">
          {hasFilter ? 'No leads match these filters.' : 'No leads yet.'}{' '}
          <Link href="/leads/new" className="link">Add a new lead</Link>
        </div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="tbl min-w-[64rem]">
            <thead><tr><th className="min-w-[17rem]">Lead</th><th>City</th><th>Type</th><th>Source</th><th>Latest signal</th><th className="num">Score</th><th>Commercial</th><th className="num">Est. value (AUD)</th><th>Service</th><th>Status</th></tr></thead>
            <tbody>
              {shown.map((l) => {
                const sig = l.latest_signal;
                return (
                  <tr key={l.id}>
                    <td className="min-w-[17rem]"><Link href={`/leads/${l.id}`} className="link text-title-small text-on-surface hover:text-primary">{l.title}</Link>{l.company && <div className="text-body-small text-on-surface-variant">{l.company.name}</div>}</td>
                    <td>{l.company?.city ?? '—'}</td>
                    <td className="whitespace-nowrap">{l.lead_type}</td>
                    <td className="whitespace-nowrap">{l.source}</td>
                    <td>{sig ? <>{label(sig.signal_type)}<div className="text-body-small text-on-surface-variant">{fmtDate(sig.published_at)}</div></> : '—'}</td>
                    <td className="num">{l.score == null ? '—' : <span className="inline-flex items-center justify-end gap-2 whitespace-nowrap">{l.score} <BandBadge band={scoreBand(l.score, settings)} /></span>}</td>
                    <td className="whitespace-nowrap"><StateBadge state={l.commercial_state} /></td>
                    <td className="num whitespace-nowrap">{fmtRange(l.est_value_low, l.est_value_high)}</td>
                    <td>{l.recommended_service ?? '—'}</td>
                    <td className="whitespace-nowrap"><StatusBadge status={l.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {leads.length > MAX_ROWS && <p className="meta">Showing first {MAX_ROWS} of {leads.length}. Narrow with filters.</p>}
    </div>
  );
}
