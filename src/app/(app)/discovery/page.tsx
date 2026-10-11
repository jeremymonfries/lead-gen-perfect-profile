import { Suspense } from 'react';
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { getSettings } from '@/lib/db';
import { fmtUsd, monthStartIso, usageSummary } from '@/lib/db/usage';
import { candidateCounts, hasActiveRun, latestRun, listCandidates } from '@/lib/db/discovery';
import type { CandidateStatus, LocationMatch } from '@/lib/types';
import { buyerRoles, linkedInPeopleSearchUrl } from '@/lib/discovery/buyer-roles';
import { fmtDate, fmtDateTime, label } from '@/components/format';
import { acceptCandidate, rejectCandidate, restoreCandidate, runDiscoveryAction, saveDiscoveryFeeds, saveDiscoveryKeywords, saveFeedMaxItems, saveDiscoveryQueries } from './actions';
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
        <p className="text-sm text-gray-600">Feeds and news search find candidate leads; Claude filters them and names the people involved. Nothing is contacted — you accept or reject each.</p>
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

  const [settings, run, active, counts, candidates, usage] = await Promise.all([
    getSettings(), latestRun(), hasActiveRun(), candidateCounts(), listCandidates(tab.id), usageSummary(monthStartIso()),
  ]);
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
  const hasBrave = Boolean(process.env.BRAVE_SEARCH_API_KEY);
  const canRun = hasAnthropic && (settings.discovery_feeds.length > 0 || hasBrave);
  const decided = counts.accepted + counts.rejected;
  const rate = decided > 0 ? `${Math.round((counts.accepted / decided) * 100)}%` : '—';

  return (
    <div className="space-y-4">
      {!hasAnthropic && (
        <div className="card border-amber-300 bg-amber-50 text-sm text-amber-900">
          Missing ANTHROPIC_API_KEY. Add it to .env.local and restart the server to enable discovery.
        </div>
      )}
      {!hasBrave && <p className="text-xs text-gray-500">News search is off (no Brave key) — feeds only.</p>}

      <div className="card space-y-2">
        <form action={runDiscoveryAction} className="flex flex-wrap items-center gap-3">
          <RunButton disabled={!canRun || active} />
          {active && <span className="text-sm text-gray-600">A run is already in progress.</span>}
          {hasAnthropic && !hasBrave && settings.discovery_feeds.length === 0 && <span className="text-sm text-gray-600">Add at least one feed to run discovery.</span>}
        </form>
        <p className="text-xs text-gray-500">Claude spend this month: {fmtUsd(usage.total)}</p>
        {run ? (
          <div className="text-sm text-gray-700">
            <div>
              Last run {fmtDateTime(run.started_at)} · {run.status} · {plural(run.feeds_checked, 'feed')} checked · {plural(run.feed_items, 'feed item')} · {plural(run.prefiltered_out, 'item')} filtered by keywords · {plural(run.capped_out ?? 0, 'item')} capped · {plural(run.results_found, 'new result')} · {plural(run.candidates_created, 'candidate')} · {plural(run.duplicates_merged ?? 0, 'duplicate')} merged · {plural(run.search_requests, 'search request')} · {plural(run.llm_calls, 'Claude call')} · Claude cost {fmtUsd(Number(run.cost_usd) || 0)}
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

      {tab.id === 'pending' && candidates.length > 0 && (
        <p className="text-xs text-gray-500">Sorted Melbourne first, then rest of Australia, then location unknown.</p>
      )}

      {candidates.length === 0 ? (
        <div className="card text-center text-gray-600">{tab.empty}</div>
      ) : (
        <div className="space-y-3">
          {candidates.map((c) => (
            <div key={c.id} className="card space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <a href={c.url} target="_blank" rel="noopener noreferrer" className="link font-medium">{c.headline}</a>
                <div className="flex flex-wrap gap-1">
                  {c.is_roundup && <span className="badge bg-purple-100 text-purple-800">Roundup — open to review</span>}
                  {c.signal_type && <span className="badge bg-gray-100 text-gray-800">{label(c.signal_type)}</span>}
                  <span className={`badge ${LOC_CLASS[c.location_match]}`}>{label(c.location_match)}</span>
                </div>
              </div>
              <div className="text-xs text-gray-500">
                {[c.publisher, fmtDate(c.published_at)].filter((x) => x && x !== '—').join(' · ')}
                {c.query && (
                  <span className="badge ml-1 bg-gray-100 text-gray-700">{c.origin_type === 'rss' ? `RSS: ${c.query}` : `Search: ${c.query}`}</span>
                )}
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
              {c.people.length > 0 && (
                <div className="text-sm">
                  <div className="text-xs font-medium text-gray-500">People named</div>
                  <ul className="space-y-0.5">
                    {c.people.map((p, i) => (
                      <li key={i} className="flex flex-wrap items-center gap-x-2">
                        <span>{p.name}{p.title ? ` — ${p.title}` : ''} ({label(p.role)})</span>
                        <a href={linkedInPeopleSearchUrl(c.company_name ?? '', p.name)} target="_blank" rel="noopener noreferrer" className="link text-xs">Search LinkedIn</a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {c.company_name && (
                <div className="flex flex-wrap items-center gap-1 text-xs">
                  <span className="text-gray-500">Who to look for:</span>
                  {buyerRoles(c.signal_type, { companyName: c.company_name }).map((role) => (
                    <a key={role} href={linkedInPeopleSearchUrl(c.company_name as string, role)} target="_blank" rel="noopener noreferrer" className="badge bg-gray-100 text-gray-800">{role}</a>
                  ))}
                </div>
              )}
              {c.duplicate_of && <p className="text-xs text-gray-500">Merged into an earlier candidate; any new people were added to it.</p>}
              {c.is_roundup && <p className="text-sm text-purple-800">Covers several organisations. Open the article and add the relevant ones as leads (New lead), then mark it reviewed.</p>}
              {c.rationale && <p className="text-xs text-gray-500">{c.rationale}</p>}
              {c.status === 'rejected' && c.reject_reason && <p className="text-xs text-gray-600">Rejected: {c.reject_reason}</p>}

              <div className="flex flex-wrap items-center gap-2">
                {c.status === 'pending' && c.is_roundup && (
                  <>
                    <a href={c.url} target="_blank" rel="noopener noreferrer" className="btn btn-primary">Open article</a>
                    <form action={rejectCandidate}>
                      <input type="hidden" name="candidate_id" value={c.id} />
                      <input type="hidden" name="reason" value="Roundup reviewed" />
                      <button type="submit" className="btn">Mark reviewed</button>
                    </form>
                  </>
                )}
                {c.status === 'pending' && !c.is_roundup && (
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
                    {c.status === 'filtered' && !c.is_roundup && (
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
        <summary className="cursor-pointer text-sm font-medium">Feeds ({settings.discovery_feeds.length})</summary>
        <form action={saveDiscoveryFeeds} className="mt-3 space-y-2">
          <textarea name="feeds" rows={8} defaultValue={settings.discovery_feeds.map((f) => `${f.name} | ${f.url}`).join('\n')} className="input w-full font-mono text-xs" aria-label="Feeds, one per line as Name | URL" />
          <p className="text-xs text-gray-500">One per line: Name | https://url (or just a URL; max 30). Checked every run. Free.</p>
          <button type="submit" className="btn btn-primary">Save feeds</button>
        </form>
        <form action={saveFeedMaxItems} className="mt-4 flex flex-wrap items-center gap-2">
          <label htmlFor="max_items" className="text-sm">Max items per feed per run</label>
          <input id="max_items" name="max_items" type="number" min={1} max={50} step={1} defaultValue={settings.discovery_feed_max_items} className="input w-20" />
          <button type="submit" className="btn">Save</button>
        </form>
      </details>

      <details className="card">
        <summary className="cursor-pointer text-sm font-medium">Feed keywords ({settings.discovery_keywords.length})</summary>
        <form action={saveDiscoveryKeywords} className="mt-3 space-y-2">
          <textarea name="keywords" rows={6} defaultValue={settings.discovery_keywords.join('\n')} className="input w-full font-mono text-xs" aria-label="Feed keywords, one per line" />
          <p className="text-xs text-gray-500">One per line or comma-separated (max 60). Feed items must contain one of these words before Claude reads them — keeps cost down.</p>
          <button type="submit" className="btn btn-primary">Save keywords</button>
        </form>
      </details>

      <details className="card">
        <summary className="cursor-pointer text-sm font-medium">Search queries ({settings.discovery_queries.length})</summary>
        <form action={saveDiscoveryQueries} className="mt-3 space-y-2">
          <textarea name="queries" rows={8} defaultValue={settings.discovery_queries.join('\n')} className="input w-full font-mono text-xs" aria-label="Search queries, one per line" />
          <p className="text-xs text-gray-500">One query per line (max 20). Only used when a Brave key is set. Each query costs one search request.</p>
          <button type="submit" className="btn btn-primary">Save queries</button>
        </form>
      </details>
    </div>
  );
}
