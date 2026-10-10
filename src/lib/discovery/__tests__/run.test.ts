import { describe, it, expect, vi } from 'vitest';
import { runDiscovery, type DiscoveryStore, type NewCandidate, type RunResult } from '../run';
import type { NewsItem, NewsSearchProvider } from '../news';
import type { LLMProvider } from '@/lib/llm/provider';

const news = (url: string, title = url): NewsItem => ({ url, title, description: 'snip', publisher: 'p.com', publishedAt: null, extraSnippets: [] });
const cls = (index: number, relevant: boolean) => ({
  index, relevant, signal_type: relevant ? 'hiring' : null, company_name: relevant ? 'Acme' : null, company_domain: null, city: null, state: null,
  location_match: 'unknown', est_headcount: null, summary: relevant ? 'Acme hires.' : 'Nothing.', rationale: 'why',
});

function mkStore(known: string[] = []) {
  const inserted: NewCandidate[] = [];
  const finished: { id: string; r: RunResult }[] = [];
  const store: DiscoveryStore = {
    startRun: vi.fn().mockResolvedValue('run1'),
    knownUrlKeys: vi.fn(async (keys: string[]) => new Set(keys.filter((k) => known.includes(k)))),
    insertCandidates: vi.fn(async (rows: NewCandidate[]) => { inserted.push(...rows); }),
    finishRun: vi.fn(async (id: string, r: RunResult) => { finished.push({ id, r }); }),
  };
  return { store, inserted, finished };
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
    await expect(runDiscovery({ search: search({}), llm: llmAll([]), store, queries: ['  ', ''] })).rejects.toThrow('No discovery queries configured');
    expect(store.startRun).not.toHaveBeenCalled();
  });

  it('dedupes across queries, skips known keys, splits pending/filtered', async () => {
    const { store, inserted, finished } = mkStore(['c.com/known']);
    const s = search({
      q1: [news('https://www.a.com/x?utm_source=1'), news('https://b.com/y'), news('https://c.com/known')],
      q2: [news('https://a.com/x/'), news('https://d.com/z')],
    });
    const r = await runDiscovery({ search: s, llm: llmAll([0]), store, queries: ['q1', 'q2', 'q1'] });
    expect(r).toMatchObject({ status: 'completed', runId: 'run1', results_found: 3, candidates_created: 1, search_requests: 2, llm_calls: 1, errors: [] });
    expect(inserted.map((c) => c.url_key)).toEqual(['a.com/x', 'b.com/y', 'd.com/z']);
    expect(inserted.map((c) => c.status)).toEqual(['pending', 'filtered', 'filtered']);
    expect(inserted[2].query).toBe('q2');
    expect(inserted[0]).toMatchObject({ run_id: 'run1', query: 'q1', headline: 'https://www.a.com/x?utm_source=1', snippet: 'snip' });
    expect(finished).toHaveLength(1);
  });

  it('continues after a search error and records it', async () => {
    const { store, inserted } = mkStore();
    const r = await runDiscovery({ search: search({ bad: new Error('boom'), good: [news('https://a.com/1')] }), llm: llmAll([0]), store, queries: ['bad', 'good'] });
    expect(r.status).toBe('completed');
    expect(r.errors).toEqual(['Search "bad": boom']);
    expect(inserted).toHaveLength(1);
  });

  it('is failed when every search fails, and still finishes the run', async () => {
    const { store, finished } = mkStore();
    const r = await runDiscovery({ search: search({ a: new Error('x'), b: new Error('y') }), llm: llmAll([]), store, queries: ['a', 'b'] });
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
    const r = await runDiscovery({ search: search({ q: items }), llm, store, queries: ['q'], batchSize: 2 });
    expect(r).toMatchObject({ results_found: 4, llm_calls: 2, candidates_created: 2, status: 'completed' });
    expect(r.errors).toEqual(['Classify batch 1: llm down']);
    expect(inserted.map((c) => c.url_key)).toEqual(['a.com/3', 'a.com/4']);
  });

  it('caps new items and notes it', async () => {
    const { store, inserted } = mkStore();
    const items = Array.from({ length: 5 }, (_, i) => news(`https://a.com/${i}`));
    const r = await runDiscovery({ search: search({ q: items }), llm: llmAll([]), store, queries: ['q'], maxNewItems: 3 });
    expect(r.results_found).toBe(3);
    expect(r.errors).toContain('Capped at 3 new results');
    expect(inserted).toHaveLength(3);
  });

  it('always calls finishRun with failed status on unexpected errors', async () => {
    const { store, finished } = mkStore();
    (store.knownUrlKeys as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('db down'));
    const r = await runDiscovery({ search: search({ q: [news('https://a.com/1')] }), llm: llmAll([0]), store, queries: ['q'] });
    expect(r.status).toBe('failed');
    expect(r.errors).toContain('db down');
    expect(finished).toHaveLength(1);
    expect(finished[0].r.status).toBe('failed');
  });

  it('falls back to headline when summary is empty', async () => {
    const { store, inserted } = mkStore();
    const llm: LLMProvider = { complete: vi.fn(async () => ({ items: [{ ...cls(0, true), summary: '' }] })) };
    await runDiscovery({ search: search({ q: [news('https://a.com/1', 'Headline')] }), llm, store, queries: ['q'] });
    expect(inserted[0].summary).toBe('Headline');
  });
});
