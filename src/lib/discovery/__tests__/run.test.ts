import { describe, it, expect, vi } from 'vitest';
import { runDiscovery, type RunDeps, type DiscoveryStore, type NewCandidate, type RunResult, type RecentCandidate } from '../run';
import type { NewsItem, NewsSearchProvider } from '../news';
import type { FeedProvider } from '../rss';
import type { CandidatePerson } from '@/lib/types';
import type { LLMProvider } from '@/lib/llm/provider';

const run = (d: Partial<RunDeps> & Pick<RunDeps, 'llm' | 'store' | 'queries'>) => runDiscovery({ feeds: [], keywords: [], ...d });
const news = (url: string, title = url): NewsItem => ({ url, title, description: 'snip', publisher: 'p.com', publishedAt: null, extraSnippets: [] });
const cls = (index: number, relevant: boolean) => ({
  index, relevant, people: [{ name: index === 0 ? ' Jo Bloggs ' : `Jo Bloggs${index}`, title: 'Partner', role: 'new_partner' }, { name: index === 0 ? 'jo bloggs' : `jo bloggs${index}`, title: null, role: 'other' }],
  signal_type: relevant ? 'hiring' : null, company_name: relevant ? `Acme${index}` : null, company_domain: null, city: null, state: null,
  location_match: 'unknown', est_headcount: null, summary: relevant ? 'Acme hires.' : 'Nothing.', rationale: 'why', roundup: false,
});

function mkStore(known: string[] = [], recent: RecentCandidate[] = []) {
  const merged: { id: string; people: CandidatePerson[] }[] = [];
  const inserted: NewCandidate[] = [];
  const finished: { id: string; r: RunResult }[] = [];
  const store: DiscoveryStore = {
    startRun: vi.fn().mockResolvedValue('run1'),
    knownUrlKeys: vi.fn(async (keys: string[]) => new Set(keys.filter((k) => known.includes(k)))),
    insertCandidates: vi.fn(async (rows: NewCandidate[]) => { inserted.push(...rows); return rows.map((r) => ({ id: `id-${r.url_key}`, url_key: r.url_key })); }),
    recentCandidates: vi.fn(async () => recent),
    mergePeople: vi.fn(async (id: string, people: CandidatePerson[]) => { merged.push({ id, people }); }),
    finishRun: vi.fn(async (id: string, r: RunResult) => { finished.push({ id, r }); }),
  };
  return { store, inserted, finished, merged };
}
const search = (map: Record<string, NewsItem[] | Error>): NewsSearchProvider => ({
  search: vi.fn(async (q: string) => { const v = map[q]; if (v instanceof Error) throw v; return v ?? []; }),
});
const llmAll = (relevantIdx: number[]): LLMProvider => ({
  complete: vi.fn(async (req) => {
    const idxs = [...req.user.matchAll(/^\[(\d+)\]/gm)].map((m) => Number(m[1]));
    return { items: idxs.map((i) => cls(i, relevantIdx.includes(i))) };
  }),
});

describe('runDiscovery', () => {
  it('throws before starting when no queries', async () => {
    const { store } = mkStore();
    await expect(run({ search: search({}), llm: llmAll([]), store, queries: ['  ', ''] })).rejects.toThrow('Nothing to run: add feeds, or a Brave key and queries');
    expect(store.startRun).not.toHaveBeenCalled();
  });

  it('dedupes across queries, skips known keys, splits pending/filtered', async () => {
    const { store, inserted, finished } = mkStore(['c.com/known']);
    const s = search({
      q1: [news('https://www.a.com/x?utm_source=1'), news('https://b.com/y'), news('https://c.com/known')],
      q2: [news('https://a.com/x/'), news('https://d.com/z')],
    });
    const r = await run({ search: s, llm: llmAll([0]), store, queries: ['q1', 'q2', 'q1'] });
    expect(r).toMatchObject({ status: 'completed', runId: 'run1', results_found: 3, candidates_created: 1, search_requests: 2, llm_calls: 1, errors: [] });
    expect(inserted.map((c) => c.url_key)).toEqual(['a.com/x', 'b.com/y', 'd.com/z']);
    expect(inserted.map((c) => c.status)).toEqual(['pending', 'filtered', 'filtered']);
    expect(inserted[2].query).toBe('q2');
    expect(inserted[0]).toMatchObject({ run_id: 'run1', query: 'q1', headline: 'https://www.a.com/x?utm_source=1', snippet: 'snip' });
    expect(finished).toHaveLength(1);
  });

  it('continues after a search error and records it', async () => {
    const { store, inserted } = mkStore();
    const r = await run({ search: search({ bad: new Error('boom'), good: [news('https://a.com/1')] }), llm: llmAll([0]), store, queries: ['bad', 'good'] });
    expect(r.status).toBe('completed');
    expect(r.errors).toEqual(['Search "bad": boom']);
    expect(inserted).toHaveLength(1);
  });

  it('is failed when every search fails, and still finishes the run', async () => {
    const { store, finished } = mkStore();
    const r = await run({ search: search({ a: new Error('x'), b: new Error('y') }), llm: llmAll([]), store, queries: ['a', 'b'] });
    expect(r).toMatchObject({ status: 'failed', search_requests: 2, results_found: 0, llm_calls: 0 });
    expect(store.insertCandidates).not.toHaveBeenCalled();
    expect(finished[0].r.status).toBe('failed');
  });

  it('does not insert items from a failed classify batch', async () => {
    const { store, inserted } = mkStore();
    const items = ['1', '2', '3', '4'].map((n) => news(`https://a.com/${n}`));
    let call = 0;
    const llm: LLMProvider = { complete: vi.fn(async (req) => {
      call++;
      if (call <= 2) throw new Error('llm down'); // batch 1: first try + retry
      const idxs = [...req.user.matchAll(/^\[(\d+)\]/gm)].map((m) => Number(m[1]));
      return { items: idxs.map((i) => cls(i, true)) };
    }) };
    const r = await run({ search: search({ q: items }), llm, store, queries: ['q'], batchSize: 2 });
    expect(r).toMatchObject({ results_found: 4, llm_calls: 2, candidates_created: 2, status: 'completed' });
    expect(r.errors).toEqual(['Classify batch 1: llm down']);
    expect(inserted.map((c) => c.url_key)).toEqual(['a.com/3', 'a.com/4']);
  });

  it('caps new items and notes it', async () => {
    const { store, inserted } = mkStore();
    const items = Array.from({ length: 5 }, (_, i) => news(`https://a.com/${i}`));
    const r = await run({ search: search({ q: items }), llm: llmAll([]), store, queries: ['q'], maxNewItems: 3 });
    expect(r.results_found).toBe(3);
    expect(r.errors).toContain('Capped at 3 new results');
    expect(inserted).toHaveLength(3);
  });

  it('always calls finishRun with failed status on unexpected errors', async () => {
    const { store, finished } = mkStore();
    (store.knownUrlKeys as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('db down'));
    const r = await run({ search: search({ q: [news('https://a.com/1')] }), llm: llmAll([0]), store, queries: ['q'] });
    expect(r.status).toBe('failed');
    expect(r.errors).toContain('db down');
    expect(finished).toHaveLength(1);
    expect(finished[0].r.status).toBe('failed');
  });

  it('falls back to headline when summary is empty', async () => {
    const { store, inserted } = mkStore();
    const llm: LLMProvider = { complete: vi.fn(async () => ({ items: [{ ...cls(0, true), summary: '' }] })) };
    await run({ search: search({ q: [news('https://a.com/1', 'Headline')] }), llm, store, queries: ['q'] });
    expect(inserted[0].summary).toBe('Headline');
  });
});

const NOW = new Date('2026-10-10T00:00:00.000Z');
const feedItem = (url: string, title: string, publishedAt: string | null = '2026-10-08T00:00:00.000Z'): NewsItem => ({ url, title, description: null, publisher: 'f.com', publishedAt, extraSnippets: [] });
const feedProv = (map: Record<string, NewsItem[] | Error>): FeedProvider => ({
  fetchFeed: vi.fn(async (u: string) => { const v = map[u]; if (v instanceof Error) throw v; return v ?? []; }),
});

describe('runDiscovery with feeds', () => {
  it('runs feeds only, filters by keywords and age, keeps undated, records people and origin', async () => {
    const { store, inserted } = mkStore();
    const fp = feedProv({ 'https://f.com/rss': [
      feedItem('https://f.com/1', 'Acme appoints new partner'),
      feedItem('https://f.com/2', 'Weather today'),
      feedItem('https://f.com/3', 'Old appoints news', '2026-08-01T00:00:00.000Z'),
      feedItem('https://f.com/4', 'Undated appoints item', null),
    ] });
    const r = await runDiscovery({ llm: llmAll([0]), store, queries: ['ignored'], feeds: [{ name: 'F', url: 'https://f.com/rss' }, { name: 'dup', url: 'https://f.com/rss' }, { name: 'bad', url: 'ftp://x' }], feedProvider: fp, keywords: ['APPOINTS'], now: () => NOW });
    expect(r).toMatchObject({ status: 'completed', feeds_checked: 1, feed_items: 3, prefiltered_out: 1, search_requests: 0, results_found: 2, candidates_created: 1 });
    expect(store.startRun).toHaveBeenCalledWith(['feed: F']);
    expect(inserted.map((c) => c.url_key)).toEqual(['f.com/1', 'f.com/4']);
    expect(inserted[0]).toMatchObject({ query: 'F', origin_type: 'rss', people: [{ name: 'Jo Bloggs', title: 'Partner', role: 'new_partner' }] });
    expect(inserted[1].status).toBe('filtered');
    expect(inserted[1].people).toHaveLength(1);
  });

  it('records feed errors and continues; failed only if every source fails', async () => {
    const { store } = mkStore();
    const fp = feedProv({ 'https://a.com/rss': new Error('Feed error 500'), 'https://b.com/rss': [feedItem('https://b.com/1', 'x')] });
    const feeds = [{ name: 'A', url: 'https://a.com/rss' }, { name: 'B', url: 'https://b.com/rss' }];
    const ok = await runDiscovery({ llm: llmAll([]), store, queries: [], feeds, feedProvider: fp, keywords: [], now: () => NOW });
    expect(ok.status).toBe('completed');
    expect(ok.errors).toEqual(['Feed "A": Feed error 500']);
    const bad = await runDiscovery({ llm: llmAll([]), store, queries: [], feeds: [feeds[0]], feedProvider: fp, keywords: [] });
    expect(bad.status).toBe('failed');
    const mixed = await runDiscovery({ llm: llmAll([]), store, queries: ['q'], search: search({ q: new Error('no') }), feeds: [feeds[0]], feedProvider: fp, keywords: [] });
    expect(mixed).toMatchObject({ status: 'failed', feeds_checked: 1, search_requests: 1 });
    const part = await runDiscovery({ llm: llmAll([]), store, queries: ['q'], search: search({ q: [news('https://z.com/1')] }), feeds: [feeds[0]], feedProvider: fp, keywords: [] });
    expect(part.status).toBe('completed');
  });

  it('throws when feeds are given without a provider and no search', async () => {
    const { store } = mkStore();
    await expect(runDiscovery({ llm: llmAll([]), store, queries: ['q'], feeds: [{ name: 'A', url: 'https://a.com/rss' }], keywords: [] })).rejects.toThrow('Nothing to run');
    expect(store.startRun).not.toHaveBeenCalled();
  });

  it('dedupes across feeds and searches (feed wins) and tags origins', async () => {
    const { store, inserted } = mkStore();
    const fp = feedProv({ 'https://f.com/rss': [feedItem('https://a.com/x', 'Feed copy')] });
    const r = await runDiscovery({
      llm: llmAll([]), store, queries: ['q'], search: search({ q: [news('https://www.a.com/x/'), news('https://b.com/y')] }),
      feeds: [{ name: 'F', url: 'https://f.com/rss' }], feedProvider: fp, keywords: [], now: () => NOW,
    });
    expect(r.results_found).toBe(2);
    expect(store.startRun).toHaveBeenCalledWith(['q', 'feed: F']);
    expect(inserted.map((c) => [c.url_key, c.origin_type, c.query])).toEqual([['a.com/x', 'rss', 'F'], ['b.com/y', 'search', 'q']]);
  });
});

describe('duplicate stories', () => {
  const llmSame = (people: CandidatePerson[][]): LLMProvider => ({
    complete: vi.fn(async (req) => {
      const idxs = [...req.user.matchAll(/^\[(\d+)\]/gm)].map((m) => Number(m[1]));
      return { items: idxs.map((i) => ({ ...cls(i, true), company_name: 'WPP', signal_type: 'exec_appointment', people: people[i] ?? [] })) };
    }),
  });
  const p = (name: string): CandidatePerson => ({ name, title: null, role: 'appointee' });
  const fp = feedProv({
    'https://a.com/rss': [feedItem('https://a.com/1', 'WPP appoints Tyler')],
    'https://b.com/rss': [feedItem('https://b.com/1', 'WPP names Tyler CEO')],
  });
  const feeds = [{ name: 'A', url: 'https://a.com/rss' }, { name: 'B', url: 'https://b.com/rss' }];

  it('filters an in-run duplicate, links it, and merges people into the original', async () => {
    const { store, inserted } = mkStore();
    const r = await runDiscovery({ llm: llmSame([[p('Tyler')], [p('Tyler'), p('Sam')]]), store, queries: [], feeds, feedProvider: fp, keywords: [], now: () => NOW });
    expect(r).toMatchObject({ candidates_created: 1, duplicates_merged: 1, status: 'completed' });
    expect(inserted.map((c) => [c.url_key, c.status, c.duplicate_of ?? null])).toEqual([['a.com/1', 'pending', null], ['b.com/1', 'filtered', 'id-a.com/1']]);
    expect(inserted[0].people.map((x) => x.name)).toEqual(['Tyler', 'Sam']);
    expect(inserted[1].rationale).toBe('Duplicate story (also in A)');
  });

  it('links a duplicate of an existing candidate and merges new people via the store', async () => {
    const recent: RecentCandidate[] = [{ id: 'ex1', company_name: 'WPP Pty Ltd', signal_type: 'exec_appointment', people: [p('Tyler')], published_at: '2026-10-07T00:00:00Z', status: 'accepted', headline: 'Old story' }];
    const { store, inserted, merged } = mkStore([], recent);
    const r = await runDiscovery({ llm: llmSame([[p('Tyler'), p('Sam')]]), store, queries: [], feeds: [feeds[0]], feedProvider: fp, keywords: [], now: () => NOW });
    expect(r).toMatchObject({ candidates_created: 0, duplicates_merged: 1 });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ status: 'filtered', duplicate_of: 'ex1', rationale: 'Duplicate story (also in Old story)' });
    expect(merged).toEqual([{ id: 'ex1', people: [p('Sam')] }]);
  });

  it('does not treat irrelevant rows as duplicates', async () => {
    const { store } = mkStore();
    const r = await runDiscovery({ llm: llmAll([]), store, queries: [], feeds, feedProvider: fp, keywords: [], now: () => NOW });
    expect(r.duplicates_merged).toBe(0);
    expect(store.recentCandidates).not.toHaveBeenCalled();
  });
});

describe('per-feed cap', () => {
  const day = (d: number) => `2026-10-0${d}T00:00:00.000Z`;
  const feeds = [{ name: 'A', url: 'https://a.com/rss' }, { name: 'B', url: 'https://b.com/rss' }];

  it('keeps the N most recent matching items per feed, undated last, and counts capped_out', async () => {
    const { store, inserted } = mkStore();
    const fp = feedProv({
      'https://a.com/rss': [
        feedItem('https://a.com/1', 'hires 1', day(1)),
        feedItem('https://a.com/undated', 'hires undated', null),
        feedItem('https://a.com/5', 'hires 5', day(5)),
        feedItem('https://a.com/nomatch', 'nothing', day(9)),
        feedItem('https://a.com/3', 'hires 3', day(3)),
      ],
      'https://b.com/rss': [feedItem('https://b.com/2', 'hires b2', day(2)), feedItem('https://b.com/4', 'hires b4', day(4))],
    });
    const r = await runDiscovery({ llm: llmAll([]), store, queries: [], feeds, feedProvider: fp, keywords: ['hires'], feedMaxItems: 2, now: () => NOW });
    expect(r).toMatchObject({ feed_items: 7, prefiltered_out: 1, capped_out: 2, results_found: 4 });
    expect(inserted.map((c) => c.url_key).sort()).toEqual(['a.com/3', 'a.com/5', 'b.com/2', 'b.com/4']);
  });

  it('keeps undated items only when there is room after dated ones', async () => {
    const { store, inserted } = mkStore();
    const fp = feedProv({ 'https://a.com/rss': [feedItem('https://a.com/u', 'hires u', null), feedItem('https://a.com/1', 'hires 1', day(1))] });
    const r = await runDiscovery({ llm: llmAll([]), store, queries: [], feeds: [feeds[0]], feedProvider: fp, keywords: ['hires'], feedMaxItems: 1, now: () => NOW });
    expect(r.capped_out).toBe(1);
    expect(inserted.map((c) => c.url_key)).toEqual(['a.com/1']);
  });

  it('defaults to 10 per feed when unset', async () => {
    const { store } = mkStore();
    const items = Array.from({ length: 13 }, (_, i) => feedItem(`https://a.com/${i}`, 'hires', `2026-10-09T00:${String(i).padStart(2, '0')}:00.000Z`));
    const r = await runDiscovery({ llm: llmAll([]), store, queries: [], feeds: [feeds[0]], feedProvider: feedProv({ 'https://a.com/rss': items }), keywords: ['hires'], now: () => NOW });
    expect(r).toMatchObject({ capped_out: 3, results_found: 10 });
  });
});

describe('roundup candidates', () => {
  it('carries is_roundup into NewCandidate', async () => {
    const { store, inserted } = mkStore();
    const llm: LLMProvider = { complete: vi.fn(async () => ({ items: [{ ...cls(0, true), roundup: true, company_name: null, signal_type: 'exec_appointment' }, cls(1, true)] })) };
    await run({ search: search({ q: [news('https://a.com/r'), news('https://b.com/n')] }), llm, store, queries: ['q'] });
    expect(inserted.find((r) => r.url === 'https://a.com/r')).toMatchObject({ is_roundup: true, status: 'pending', company_name: null });
    expect(inserted.find((r) => r.url === 'https://b.com/n')).toMatchObject({ is_roundup: false });
  });
});
