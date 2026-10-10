import { Suspense } from 'react';
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { getSettings } from '@/lib/db';
import { candidateCounts, hasActiveRun, latestRun, listCandidates } from '@/lib/db/discovery';
import type { CandidateStatus, LocationMatch } from '@/lib/types';
import { fmtDate, fmtDateTime, label } from '@/components/format';
import { acceptCandidate, rejectCandidate, restoreCandidate, runDiscoveryAction, saveDiscoveryQueries } from './actions';
import { RunButton } from './run-button';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const maxDuration = 300;

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

const TABS: { id: CandidateStatus; name: string; empty: string }[] = [
  { id: 'pending', name: 'Pending', empty: 'No candidates waiting for review. Run discovery to find some.' },
  { id: 'accepted', name: 'Accepted', empty: 'Nothing accepted yet.' },
  { id: 'rejected', name: 'Rejected', empty: 'Nothing rejected.' },
  { id: 'filtered', name: 'Filtered out by Claude', empty: 'Nothing was filtered out.' },
];
const LOC_CLASS: Record<LocationMatch, string> = {
  melbourne: 'bg-green-100 text-green-800',
  australia_other: 'bg-blue-100 text-blue-800',
  outside_australia: 'bg-gray-100 text-gray-700',
  unknown: 'bg-amber-100 text-amber-800',
};

export default function DiscoveryPage({ searchParams }: { searchParams: Promise<SP> }) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Discovery</h1>
        <p className="text-sm text-gray-600">News search finds candidate leads; Claude filters them. Nothing is contacted — you accept or reject each.</p>
      </div>
      <Suspense fallback={<DiscoverySkeleton />}>
        <DiscoveryContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function DiscoverySkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading discovery">
      <div className="card h-20 animate-pulse bg-gray-100" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => <div key={i} className="card h-16 animate-pulse bg-gray-100" />)}
      </div>
      <div className="card h-48 animate-pulse bg-gray-100" />
    </div>
  );
}

async function DiscoveryContent({ searchParams }: { searchParams: Promise<SP> }) {
  await requireUser();
  const sp = await searchParams;
  const requested = one(sp.status);
  const tab = TABS.find((t) => t.id === requested) ?? TABS[0];

  const [settings, run, active, counts, candidates] = await Promise.all([
    getSettings(), latestRun(), hasActiveRun(), candidateCounts(), listCandidates(tab.id),
  ]);
  const missing = [!process.env.BRAVE_SEARCH_API_KEY && 'BRAVE_SEARCH_API_KEY', !process.env.ANTHROPIC_API_KEY && 'ANTHROPIC_API_KEY'].filter(Boolean) as string[];
  const decided = counts.accepted + counts.rejected;
  const rate = decided > 0 ? `${Math.round((counts.accepted / decided) * 100)}%` : '—';

  return (
    <div className="space-y-4">
      {missing.length > 0 && (
        <div className="card border-amber-300 bg-amber-50 text-sm text-amber-900">
          Missing {missing.join(' and ')}. Add {missing.length > 1 ? 'them' : 'it'} to .env.local and restart the server to enable discovery.
        </div>
      )}

      <div className="card space-y-2">
        <form action={runDiscoveryAction} className="flex flex-wrap items-center gap-3">
          <RunButton disabled={missing.length > 0 || active} />
          {active && <span className="text-sm text-gray-600">A run is already in progress.</span>}
        </form>
        {run ? (
          <div className="text-sm text-gray-700">
            <div>
              Last run {fmtDateTime(run.started_at)} · {run.status} · {plural(run.queries.length, 'query', 'queries')} · {plural(run.results_found, 'new result')} · {plural(run.candidates_created, 'candidate')} · {plural(run.search_requests, 'search request')} · {plural(run.llm_calls, 'Claude call')}
            </div>
            {run.errors.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-xs text-red-700">
                {run.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            )}
          </div>
        ) : <p className="text-sm text-gray-600">No runs yet.</p>}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <div className="card"><div className="text-xs text-gray-500">Pending</div><div className="text-2xl font-semibold">{counts.pending}</div></div>
        <div className="card"><div className="text-xs text-gray-500">Accepted</div><div className="text-2xl font-semibold">{counts.accepted}</div></div>
        <div className="card"><div className="text-xs text-gray-500">Rejected</div><div className="text-2xl font-semibold">{counts.rejected}</div></div>
        <div className="card"><div className="text-xs text-gray-500">Acceptance rate</div><div className="text-2xl font-semibold">{rate}</div></div>
        <div className="card"><div className="text-xs text-gray-500">Filtered out by Claude</div><div className="text-2xl font-semibold">{counts.filtered}</div></div>
      </div>

      <nav className="flex flex-wrap gap-2 text-sm" aria-label="Candidate status">
        {TABS.map((t) => (
          <Link key={t.id} href={`/discovery?status=${t.id}`} className={`btn ${t.id === tab.id ? 'btn-primary' : ''}`} aria-current={t.id === tab.id ? 'page' : undefined}>
            {t.name} ({counts[t.id]})
          </Link>
        ))}
      </nav>

      {candidates.length === 0 ? (
        <div className="card text-center text-gray-600">{tab.empty}</div>
      ) : (
        <div className="space-y-3">
          {candidates.map((c) => (
            <div key={c.id} className="card space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <a href={c.url} target="_blank" rel="noopener noreferrer" className="link font-medium">{c.headline}</a>
                <div className="flex flex-wrap gap-1">
                  {c.signal_type && <span className="badge bg-gray-100 text-gray-800">{label(c.signal_type)}</span>}
                  <span className={`badge ${LOC_CLASS[c.location_match]}`}>{label(c.location_match)}</span>
                </div>
              </div>
              <div className="text-xs text-gray-500">
                {[c.publisher, fmtDate(c.published_at), c.query].filter((x) => x && x !== '—').join(' · ')}
              </div>
              {(c.company_name || c.est_headcount != null) && (
                <div className="text-sm">
                  {c.company_name && <span className="font-medium">{c.company_name}</span>}
                  {c.company_domain && <span className="text-gray-500"> ({c.company_domain})</span>}
                  {(c.city || c.state) && <span className="text-gray-500"> · {[c.city, c.state].filter(Boolean).join(', ')}</span>}
                  {c.est_headcount != null && <span className="text-gray-500"> · ~{c.est_headcount} staff</span>}
                </div>
              )}
              <p className="text-sm">{c.summary}</p>
              {c.rationale && <p className="text-xs text-gray-500">{c.rationale}</p>}
              {c.status === 'rejected' && c.reject_reason && <p className="text-xs text-gray-600">Rejected: {c.reject_reason}</p>}

              <div className="flex flex-wrap items-center gap-2">
                {c.status === 'pending' && (
                  <>
                    <form action={acceptCandidate}>
                      <input type="hidden" name="candidate_id" value={c.id} />
                      <button type="submit" className="btn btn-primary">Accept</button>
                    </form>
                    <form action={rejectCandidate} className="flex flex-wrap gap-2">
                      <input type="hidden" name="candidate_id" value={c.id} />
                      <input name="reason" placeholder="Reason (optional)" className="input" aria-label="Reject reason" />
                      <button type="submit" className="btn">Reject</button>
                    </form>
                  </>
                )}
                {c.status === 'accepted' && c.lead_id && <Link href={`/leads/${c.lead_id}`} className="link text-sm">View lead</Link>}
                {(c.status === 'rejected' || c.status === 'filtered') && (
                  <>
                    <form action={restoreCandidate}>
                      <input type="hidden" name="candidate_id" value={c.id} />
                      <button type="submit" className="btn">Restore to pending</button>
                    </form>
                    {c.status === 'filtered' && (
                      <form action={acceptCandidate}>
                        <input type="hidden" name="candidate_id" value={c.id} />
                        <button type="submit" className="btn btn-primary">Accept</button>
                      </form>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <details className="card">
        <summary className="cursor-pointer text-sm font-medium">Search queries ({settings.discovery_queries.length})</summary>
        <form action={saveDiscoveryQueries} className="mt-3 space-y-2">
          <textarea name="queries" rows={8} defaultValue={settings.discovery_queries.join('\n')} className="input w-full font-mono text-xs" aria-label="Search queries, one per line" />
          <p className="text-xs text-gray-500">One query per line (max 20). Each query costs one Brave search request per run.</p>
          <button type="submit" className="btn btn-primary">Save queries</button>
        </form>
      </details>
    </div>
  );
}
