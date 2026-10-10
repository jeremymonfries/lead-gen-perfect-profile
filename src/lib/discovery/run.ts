import type { LLMProvider } from '@/lib/llm/provider';
import type { LocationMatch, SignalType } from '@/lib/types';
import { classifyBatch, type ClassifyInput } from './classify';
import type { NewsItem, NewsSearchOptions, NewsSearchProvider } from './news';
import { normalizeUrl } from './url';

export interface NewCandidate {
  run_id: string; url: string; url_key: string; headline: string; snippet: string | null; publisher: string | null; published_at: string | null; query: string;
  signal_type: SignalType | null; company_name: string | null; company_domain: string | null; city: string | null; state: string | null;
  location_match: LocationMatch; est_headcount: number | null; summary: string; rationale: string | null; status: 'pending' | 'filtered';
}
export interface RunResult { status: 'completed' | 'failed'; results_found: number; candidates_created: number; search_requests: number; llm_calls: number; errors: string[]; }
export interface DiscoveryStore {
  startRun(queries: string[]): Promise<string>;
  knownUrlKeys(keys: string[]): Promise<Set<string>>;
  insertCandidates(rows: NewCandidate[]): Promise<void>;
  finishRun(id: string, result: RunResult): Promise<void>;
}
export interface RunDeps {
  search: NewsSearchProvider; llm: LLMProvider; store: DiscoveryStore; queries: string[];
  freshness?: NewsSearchOptions['freshness']; batchSize?: number; maxNewItems?: number;
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function runDiscovery(deps: RunDeps): Promise<RunResult & { runId: string }> {
  const queries = [...new Set(deps.queries.map((q) => q.trim()).filter(Boolean))];
  if (!queries.length) throw new Error('No discovery queries configured');
  const batchSize = deps.batchSize ?? 15;
  const maxNew = deps.maxNewItems ?? 120;

  const runId = await deps.store.startRun(queries);
  const result: RunResult = { status: 'completed', results_found: 0, candidates_created: 0, search_requests: 0, llm_calls: 0, errors: [] };
  try {
    const found = new Map<string, { item: NewsItem; query: string }>();
    let searchFailures = 0;
    for (const q of queries) {
      result.search_requests++;
      try {
        const items = await deps.search.search(q, { freshness: deps.freshness });
        for (const item of items) {
          const key = normalizeUrl(item.url);
          if (!found.has(key)) found.set(key, { item, query: q });
        }
      } catch (e) {
        searchFailures++;
        result.errors.push(`Search "${q}": ${msg(e)}`);
      }
    }
    if (searchFailures === queries.length) result.status = 'failed';

    const keys = [...found.keys()];
    const known = keys.length ? await deps.store.knownUrlKeys(keys) : new Set<string>();
    let fresh = keys.filter((k) => !known.has(k));
    if (fresh.length > maxNew) {
      result.errors.push(`Capped at ${maxNew} new results`);
      fresh = fresh.slice(0, maxNew);
    }
    result.results_found = fresh.length;

    const rows: NewCandidate[] = [];
    for (let i = 0, n = 1; i < fresh.length; i += batchSize, n++) {
      const chunk = fresh.slice(i, i + batchSize).map((k) => ({ key: k, ...found.get(k)! }));
      const inputs: ClassifyInput[] = chunk.map((c, idx) => ({ index: idx, title: c.item.title, description: c.item.description, publisher: c.item.publisher, publishedAt: c.item.publishedAt, url: c.item.url }));
      result.llm_calls++;
      try {
        const out = await classifyBatch(inputs, deps.llm);
        chunk.forEach((c, idx) => {
          const cl = out.get(idx);
          if (!cl) return;
          rows.push({
            run_id: runId, url: c.item.url, url_key: c.key, headline: c.item.title,
            snippet: [c.item.description, ...c.item.extraSnippets].filter(Boolean).join(' ') || null,
            publisher: c.item.publisher, published_at: c.item.publishedAt, query: c.query,
            signal_type: cl.signal_type, company_name: cl.company_name, company_domain: cl.company_domain, city: cl.city, state: cl.state,
            location_match: cl.location_match, est_headcount: cl.est_headcount, summary: cl.summary || c.item.title, rationale: cl.rationale || null,
            status: cl.relevant ? 'pending' : 'filtered',
          });
        });
      } catch (e) {
        result.errors.push(`Classify batch ${n}: ${msg(e)}`);
      }
    }
    if (rows.length) await deps.store.insertCandidates(rows);
    result.candidates_created = rows.filter((r) => r.status === 'pending').length;
  } catch (e) {
    result.status = 'failed';
    result.errors.push(msg(e));
  } finally {
    await deps.store.finishRun(runId, result);
  }
  return { ...result, runId };
}
