import type { LLMProvider } from '@/lib/llm/provider';
import type { CandidatePerson, LocationMatch, OriginType, SignalType } from '@/lib/types';
import { classifyBatch, type ClassifyInput } from './classify';
import type { NewsItem, NewsSearchOptions, NewsSearchProvider } from './news';
import { matchesKeywords, type FeedProvider, type FeedSource } from './rss';
import { normalizeUrl } from './url';

export interface NewCandidate {
  run_id: string; url: string; url_key: string; headline: string; snippet: string | null; publisher: string | null; published_at: string | null; query: string;
  origin_type: OriginType; people: CandidatePerson[];
  signal_type: SignalType | null; company_name: string | null; company_domain: string | null; city: string | null; state: string | null;
  location_match: LocationMatch; est_headcount: number | null; summary: string; rationale: string | null; status: 'pending' | 'filtered';
}
export interface RunResult {
  status: 'completed' | 'failed'; results_found: number; candidates_created: number; search_requests: number; llm_calls: number;
  feeds_checked: number; feed_items: number; prefiltered_out: number; errors: string[];
}
export interface DiscoveryStore {
  startRun(queries: string[]): Promise<string>;
  knownUrlKeys(keys: string[]): Promise<Set<string>>;
  insertCandidates(rows: NewCandidate[]): Promise<void>;
  finishRun(id: string, result: RunResult): Promise<void>;
}
export interface RunDeps {
  llm: LLMProvider; store: DiscoveryStore;
  queries: string[]; search?: NewsSearchProvider;
  feeds: FeedSource[]; feedProvider?: FeedProvider;
  keywords: string[]; feedMaxAgeDays?: number;
  freshness?: NewsSearchOptions['freshness']; batchSize?: number; maxNewItems?: number; now?: () => Date;
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function runDiscovery(deps: RunDeps): Promise<RunResult & { runId: string }> {
  const queries = deps.search ? [...new Set(deps.queries.map((q) => q.trim()).filter(Boolean))] : [];
  const feeds: FeedSource[] = [];
  if (deps.feedProvider) {
    const seenUrls = new Set<string>();
    for (const f of deps.feeds) {
      const url = f.url.trim();
      if (!/^https?:\/\/\S+$/i.test(url) || seenUrls.has(url)) continue;
      seenUrls.add(url);
      feeds.push({ name: f.name.trim() || url, url });
    }
  }
  if (!queries.length && !feeds.length) throw new Error('Nothing to run: add feeds, or a Brave key and queries');
  const batchSize = deps.batchSize ?? 15;
  const maxNew = deps.maxNewItems ?? 120;
  const maxAgeMs = (deps.feedMaxAgeDays ?? 14) * 86_400_000;
  const now = (deps.now ?? (() => new Date()))().getTime();

  const runId = await deps.store.startRun([...queries, ...feeds.map((f) => `feed: ${f.name}`)]);
  const result: RunResult = { status: 'completed', results_found: 0, candidates_created: 0, search_requests: 0, llm_calls: 0, feeds_checked: 0, feed_items: 0, prefiltered_out: 0, errors: [] };
  try {
    const found = new Map<string, { item: NewsItem; origin: string; type: OriginType }>();
    let failures = 0;
    for (const f of feeds) {
      result.feeds_checked++;
      try {
        const items = await deps.feedProvider!.fetchFeed(f.url);
        for (const item of items) {
          const t = item.publishedAt ? Date.parse(item.publishedAt) : NaN;
          if (!Number.isNaN(t) && now - t > maxAgeMs) continue;
          result.feed_items++;
          if (!matchesKeywords(item, deps.keywords)) { result.prefiltered_out++; continue; }
          const key = normalizeUrl(item.url);
          if (!found.has(key)) found.set(key, { item, origin: f.name, type: 'rss' });
        }
      } catch (e) {
        failures++;
        result.errors.push(`Feed "${f.name}": ${msg(e)}`);
      }
    }
    for (const q of queries) {
      result.search_requests++;
      try {
        const items = await deps.search!.search(q, { freshness: deps.freshness });
        for (const item of items) {
          const key = normalizeUrl(item.url);
          if (!found.has(key)) found.set(key, { item, origin: q, type: 'search' });
        }
      } catch (e) {
        failures++;
        result.errors.push(`Search "${q}": ${msg(e)}`);
      }
    }
    if (failures === feeds.length + queries.length) result.status = 'failed';

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
            publisher: c.item.publisher, published_at: c.item.publishedAt, query: c.origin,
            origin_type: c.type, people: cl.people,
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
