import { Suspense } from 'react';
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { getSettings } from '@/lib/db';
import { fmtUsd, monthStartIso, usageSummary } from '@/lib/db/usage';
import { candidateCounts, hasActiveRun, lastSearchRun, latestRun, listCandidates } from '@/lib/db/discovery';
import type { CandidateStatus, LocationMatch } from '@/lib/types';
import { buyerRoles, linkedInPeopleSearchUrl } from '@/lib/discovery/buyer-roles';
import { fmtDate, fmtDateTime, label } from '@/components/format';
import { acceptCandidate, rejectCandidate, restoreCandidate, runFeedsAction, runSearchAction, saveDiscoveryFeeds, saveDiscoveryKeywords, saveFeedMaxItems, saveDiscoveryQueries } from './actions';
import { RunButton } from './run-button';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const maxDuration = 300;

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

const TABS: { id: CandidateStatus; name: string; empty: string }[] = [
  { id: 'pending', name: 'Pending', empty: 'No candidates waiting for review. Check feeds to find some.' },
  { id: 'accepted', name: 'Accepted', empty: 'Nothing accepted yet.' },
  { id: 'rejected', name: 'Rejected', empty: 'Nothing rejected.' },
  { id: 'filtered', name: 'Filtered out by Claude', empty: 'Nothing was filtered out.' },
];
const LOC_CLASS: Record<LocationMatch, string> = {
  melbourne: 'bg-success-container text-on-success-container',
  australia_other: 'bg-tertiary-container text-on-tertiary-container',
  outside_australia: 'bg-surface-container-high text-on-surface-variant',
  unknown: 'bg-warning-container text-on-warning-container',
};

export default function DiscoveryPage({ searchParams }: { searchParams: Promise<SP> }) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-headline-small">Discovery</h1>
        <p className="text-body-medium text-on-surface-variant">Feeds and news search find candidate leads; Claude filters them and names the people involved. Nothing is contacted — you accept or reject each.</p>
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
      <div className="card h-20 animate-pulse bg-surface-container-high" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => <div key={i} className="card h-16 animate-pulse bg-surface-container-high" />)}
      </div>
      <div className="card h-48 animate-pulse bg-surface-container-high" />
    </div>
  );
}

async function DiscoveryContent({ searchParams }: { searchParams: Promise<SP> }) {
  await requireUser();
  const sp = await searchParams;
  const requested = one(sp.status);
  const tab = TABS.find((t) => t.id === requested) ?? TABS[0];

  const [settings, run, searchRun, active, counts, candidates, usage] = await Promise.all([
    getSettings(), latestRun(), lastSearchRun(), hasActiveRun(), candidateCounts(), listCandidates(tab.id), usageSummary(monthStartIso()),
  ]);
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
  const canFeeds = hasAnthropic && settings.discovery_feeds.length > 0;
  const canSearch = hasAnthropic && settings.discovery_queries.length > 0;
  const decided = counts.accepted + counts.rejected;
  const rate = decided > 0 ? `${Math.round((counts.accepted / decided) * 100)}%` : '—';

  return (
    <div className="space-y-4">
      {!hasAnthropic && (
        <div className="banner banner-warning">
          Missing ANTHROPIC_API_KEY. Add it to .env.local and restart the server to enable discovery.
        </div>
      )}

      <div className="card space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <form action={runFeedsAction}>
            <RunButton disabled={!canFeeds || active} label="Check feeds" pendingLabel="Checking feeds… this takes about a minute" />
          </form>
          <form action={runSearchAction}>
            <RunButton secondary disabled={!canSearch || active} label="Search news" pendingLabel="Searching… up to two minutes" />
          </form>
          {active && <span className="text-body-medium text-on-surface-variant">A run is already in progress.</span>}
          {hasAnthropic && settings.discovery_feeds.length === 0 && <span className="text-body-medium text-on-surface-variant">Add at least one feed to check feeds.</span>}
        </div>
        <p className="text-body-small text-on-surface-variant">Search news: searches the web for each query below using Claude web search — about US$0.01 per query plus a little Claude usage (≈US$0.15 for 10 queries). Weekly is plenty.</p>
        <p className="text-body-small text-on-surface-variant">Last news search: {searchRun ? fmtDateTime(searchRun.started_at) : 'never'}</p>
        <p className="text-body-small text-on-surface-variant">Claude spend this month: {fmtUsd(usage.total)}</p>
        {run ? (
          <div className="text-body-medium text-on-surface-variant">
            <div>
              Last run {fmtDateTime(run.started_at)} · {run.status} · {plural(run.feeds_checked, 'feed')} checked · {plural(run.feed_items, 'feed item')} · {plural(run.prefiltered_out, 'item')} filtered by keywords · {plural(run.capped_out ?? 0, 'item')} capped · {plural(run.results_found, 'new result')} · {plural(run.candidates_created, 'candidate')} · {plural(run.duplicates_merged ?? 0, 'duplicate')} merged · {plural(run.search_requests, 'search request')} · {plural(run.llm_calls, 'Claude call')} · Claude cost {fmtUsd(Number(run.cost_usd) || 0)}
            </div>
            {run.errors.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-body-small text-error">
                {run.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            )}
          </div>
        ) : <p className="text-body-medium text-on-surface-variant">No runs yet.</p>}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <div className="card"><div className="text-body-small text-on-surface-variant">Pending</div><div className="text-headline-small">{counts.pending}</div></div>
        <div className="card"><div className="text-body-small text-on-surface-variant">Accepted</div><div className="text-headline-small">{counts.accepted}</div></div>
        <div className="card"><div className="text-body-small text-on-surface-variant">Rejected</div><div className="text-headline-small">{counts.rejected}</div></div>
        <div className="card"><div className="text-body-small text-on-surface-variant">Acceptance rate</div><div className="text-headline-small">{rate}</div></div>
        <div className="card"><div className="text-body-small text-on-surface-variant">Filtered out by Claude</div><div className="text-headline-small">{counts.filtered}</div></div>
      </div>

      <nav className="tabs" aria-label="Candidate status">
        {TABS.map((t) => (
          <Link key={t.id} href={`/discovery?status=${t.id}`} className="tab" aria-current={t.id === tab.id ? 'page' : undefined}>
            {t.name} ({counts[t.id]})
          </Link>
        ))}
      </nav>

      {tab.id === 'pending' && candidates.length > 0 && (
        <p className="text-body-small text-on-surface-variant">Sorted Melbourne first, then rest of Australia, then location unknown.</p>
      )}

      {candidates.length === 0 ? (
        <div className="card text-center text-on-surface-variant">{tab.empty}</div>
      ) : (
        <div className="space-y-3">
          {candidates.map((c) => (
            <div key={c.id} className="card space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <a href={c.url} target="_blank" rel="noopener noreferrer" className="link text-title-small">{c.headline}</a>
                <div className="flex flex-wrap gap-1">
                  {c.is_roundup && <span className="badge bg-secondary-container text-on-secondary-container">Roundup — open to review</span>}
                  {c.signal_type && <span className="badge bg-surface-container-high text-on-surface">{label(c.signal_type)}</span>}
                  <span className={`badge ${LOC_CLASS[c.location_match]}`}>{label(c.location_match)}</span>
                </div>
              </div>
              <div className="text-body-small text-on-surface-variant">
                {[c.publisher, fmtDate(c.published_at)].filter((x) => x && x !== '—').join(' · ')}
                {c.query && (
                  <span className="badge ml-1 bg-surface-container-high text-on-surface-variant">{c.origin_type === 'rss' ? `RSS: ${c.query}` : `Search: ${c.query}`}</span>
                )}
              </div>
              {(c.company_name || c.est_headcount != null) && (
                <div className="text-body-medium">
                  {c.company_name && <span className="text-title-small">{c.company_name}</span>}
                  {c.company_domain && <span className="text-on-surface-variant"> ({c.company_domain})</span>}
                  {(c.city || c.state) && <span className="text-on-surface-variant"> · {[c.city, c.state].filter(Boolean).join(', ')}</span>}
                  {c.est_headcount != null && <span className="text-on-surface-variant"> · ~{c.est_headcount} staff</span>}
                </div>
              )}
              <p className="text-body-medium">{c.summary}</p>
              {c.people.length > 0 && (
                <div className="text-body-medium">
                  <div className="text-label-medium text-on-surface-variant">People named</div>
                  <ul className="space-y-0.5">
                    {c.people.map((p, i) => (
                      <li key={i} className="flex flex-wrap items-center gap-x-2">
                        <span>{p.name}{p.title ? ` — ${p.title}` : ''} ({label(p.role)})</span>
                        <a href={linkedInPeopleSearchUrl(c.company_name ?? '', p.name)} target="_blank" rel="noopener noreferrer" className="link text-body-small">Search LinkedIn</a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {c.company_name && (
                <div className="flex flex-wrap items-center gap-1 text-body-small">
                  <span className="text-on-surface-variant">Who to look for:</span>
                  {buyerRoles(c.signal_type, { companyName: c.company_name }).map((role) => (
                    <a key={role} href={linkedInPeopleSearchUrl(c.company_name as string, role)} target="_blank" rel="noopener noreferrer" className="badge bg-surface-container-high text-on-surface">{role}</a>
                  ))}
                </div>
              )}
              {c.duplicate_of && <p className="text-body-small text-on-surface-variant">Merged into an earlier candidate; any new people were added to it.</p>}
              {c.is_roundup && <p className="text-body-medium text-on-surface-variant">Covers several organisations. Open the article and add the relevant ones as leads (New lead), then mark it reviewed.</p>}
              {c.rationale && <p className="text-body-small text-on-surface-variant">{c.rationale}</p>}
              {c.status === 'rejected' && c.reject_reason && <p className="text-body-small text-on-surface-variant">Rejected: {c.reject_reason}</p>}

              <div className="flex flex-wrap items-center gap-2">
                {c.status === 'pending' && c.is_roundup && (
                  <>
                    <a href={c.url} target="_blank" rel="noopener noreferrer" className="btn btn-primary">Open article</a>
                    <form action={rejectCandidate}>
                      <input type="hidden" name="candidate_id" value={c.id} />
                      <input type="hidden" name="reason" value="Roundup reviewed" />
                      <button type="submit" className="btn btn-tonal">Mark reviewed</button>
                    </form>
                  </>
                )}
                {c.status === 'pending' && !c.is_roundup && (
                  <>
                    <form action={acceptCandidate}>
                      <input type="hidden" name="candidate_id" value={c.id} />
                      <button type="submit" className="btn btn-primary">Accept</button>
                    </form>
                    <form action={rejectCandidate} className="flex min-w-[16rem] flex-1 items-center gap-2">
                      <input type="hidden" name="candidate_id" value={c.id} />
                      <input name="reason" placeholder="Reason (optional)" className="input min-w-0 flex-1" aria-label="Reject reason" />
                      <button type="submit" className="btn">Reject</button>
                    </form>
                  </>
                )}
                {c.status === 'accepted' && c.lead_id && <Link href={`/leads/${c.lead_id}`} className="link text-body-medium">View lead</Link>}
                {(c.status === 'rejected' || c.status === 'filtered') && (
                  <>
                    <form action={restoreCandidate}>
                      <input type="hidden" name="candidate_id" value={c.id} />
                      <button type="submit" className="btn btn-tonal">Restore to pending</button>
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
        <summary className="cursor-pointer text-title-small">Feeds ({settings.discovery_feeds.length})</summary>
        <form action={saveDiscoveryFeeds} className="mt-3 space-y-2">
          <textarea name="feeds" rows={8} defaultValue={settings.discovery_feeds.map((f) => `${f.name} | ${f.url}`).join('\n')} className="input w-full font-mono text-body-small" aria-label="Feeds, one per line as Name | URL" />
          <p className="text-body-small text-on-surface-variant">One per line: Name | https://url (or just a URL; max 30). Checked every run. Free.</p>
          <button type="submit" className="btn btn-tonal">Save feeds</button>
        </form>
        <form action={saveFeedMaxItems} className="mt-4 flex flex-wrap items-center gap-2">
          <label htmlFor="max_items" className="text-body-medium">Max items per feed per run</label>
          <input id="max_items" name="max_items" type="number" min={1} max={50} step={1} defaultValue={settings.discovery_feed_max_items} className="input w-20" />
          <button type="submit" className="btn btn-tonal">Save</button>
        </form>
      </details>

      <details className="card">
        <summary className="cursor-pointer text-title-small">Feed keywords ({settings.discovery_keywords.length})</summary>
        <form action={saveDiscoveryKeywords} className="mt-3 space-y-2">
          <textarea name="keywords" rows={6} defaultValue={settings.discovery_keywords.join('\n')} className="input w-full font-mono text-body-small" aria-label="Feed keywords, one per line" />
          <p className="text-body-small text-on-surface-variant">One per line or comma-separated (max 60). Feed items must contain one of these words before Claude reads them — keeps cost down.</p>
          <button type="submit" className="btn btn-tonal">Save keywords</button>
        </form>
      </details>

      <details className="card">
        <summary className="cursor-pointer text-title-small">Search queries ({settings.discovery_queries.length})</summary>
        <form action={saveDiscoveryQueries} className="mt-3 space-y-2">
          <textarea name="queries" rows={8} defaultValue={settings.discovery_queries.join('\n')} className="input w-full font-mono text-body-small" aria-label="Search queries, one per line" />
          <p className="text-body-small text-on-surface-variant">Used by Search news. Each query is one web search (US$0.01). One per line (max 20; a run uses the first 15).</p>
          <button type="submit" className="btn btn-tonal">Save queries</button>
        </form>
      </details>
    </div>
  );
}
