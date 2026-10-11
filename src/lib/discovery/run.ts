import type { LLMProvider } from '@/lib/llm/provider';
import type { CandidatePerson, LocationMatch, OriginType, SignalType } from '@/lib/types';
import { isSameStory, newPeople } from './dedupe';
import { classifyBatch, type ClassifyInput } from './classify';
import type { NewsItem, NewsSearchOptions, NewsSearchProvider } from './news';
import { matchesKeywords, type FeedProvider, type FeedSource } from './rss';
import { normalizeUrl } from './url';

export interface NewCandidate {
  run_id: string; url: string; url_key: string; headline: string; snippet: string | null; publisher: string | null; published_at: string | null; query: string;
  origin_type: OriginType; people: CandidatePerson[];
  signal_type: SignalType | null; company_name: string | null; company_domain: string | null; city: string | null; state: string | null;
  location_match: LocationMatch; est_headcount: number | null; summary: string; rationale: string | null; status: 'pending' | 'filtered'; is_roundup: boolean;
  duplicate_of?: string | null;
}
export interface RunResult {
  status: 'completed' | 'failed'; results_found: number; candidates_created: number; search_requests: number; llm_calls: number;
  feeds_checked: number; feed_items: number; prefiltered_out: number; capped_out: number; duplicates_merged: number; errors: string[];
}
export interface RecentCandidate {
  id: string; company_name: string | null; signal_type: SignalType | null; people: CandidatePerson[]; published_at: string | null; status: string;
  /** Optional, used only to word the duplicate rationale. */
  query?: string | null; headline?: string;
}
export interface DiscoveryStore {
  startRun(queries: string[]): Promise<string>;
  knownUrlKeys(keys: string[]): Promise<Set<string>>;
  insertCandidates(rows: NewCandidate[]): Promise<{ id: string; url_key: string }[]>;
  recentCandidates(sinceDays: number): Promise<RecentCandidate[]>;
  mergePeople(id: string, people: CandidatePerson[]): Promise<void>;
  finishRun(id: string, result: RunResult): Promise<void>;
}
export interface RunDeps {
  llm: LLMProvider; store: DiscoveryStore;
  queries: string[]; search?: NewsSearchProvider;
  feeds: FeedSource[]; feedProvider?: FeedProvider;
  keywords: string[]; feedMaxAgeDays?: number; feedMaxItems?: number;
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
  if (!queries.length && !feeds.length) throw new Error('Nothing to run: add feeds or search queries');
  const batchSize = deps.batchSize ?? 15;
  const maxNew = deps.maxNewItems ?? 120;
  const feedMax = deps.feedMaxItems ?? 10;
  const maxAgeMs = (deps.feedMaxAgeDays ?? 14) * 86_400_000;
  const now = (deps.now ?? (() => new Date()))().getTime();

  const runId = await deps.store.startRun([...queries, ...feeds.map((f) => `feed: ${f.name}`)]);
  const result: RunResult = { status: 'completed', results_found: 0, candidates_created: 0, search_requests: 0, llm_calls: 0, feeds_checked: 0, feed_items: 0, prefiltered_out: 0, capped_out: 0, duplicates_merged: 0, errors: [] };
  try {
    const found = new Map<string, { item: NewsItem; origin: string; type: OriginType }>();
    let failures = 0;
    for (const f of feeds) {
      result.feeds_checked++;
      try {
        const items = await deps.feedProvider!.fetchFeed(f.url);
        const matched: { item: NewsItem; t: number }[] = [];
        for (const item of items) {
          const t = item.publishedAt ? Date.parse(item.publishedAt) : NaN;
          if (!Number.isNaN(t) && now - t > maxAgeMs) continue;
          result.feed_items++;
          if (!matchesKeywords(item, deps.keywords)) { result.prefiltered_out++; continue; }
          matched.push({ item, t });
        }
        // Most recent first, undated last (stable sort keeps feed order within ties).
        matched.sort((a, b) => (Number.isNaN(a.t) ? 1 : 0) - (Number.isNaN(b.t) ? 1 : 0) || (Number.isNaN(a.t) || Number.isNaN(b.t) ? 0 : b.t - a.t));
        result.capped_out += Math.max(0, matched.length - feedMax);
        for (const { item } of matched.slice(0, feedMax)) {
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
            status: cl.relevant ? 'pending' : 'filtered', is_roundup: cl.roundup,
          });
        });
      } catch (e) {
        result.errors.push(`Classify batch ${n}: ${msg(e)}`);
      }
    }
    // Merge duplicate stories (same story from different feeds with different URLs).
    const duplicates: { row: NewCandidate; ofKey: string | null; ofId: string | null }[] = [];
    const originals: NewCandidate[] = [];
    if (rows.some((r) => r.status === 'pending')) {
      let existing: RecentCandidate[] = [];
      try {
        existing = await deps.store.recentCandidates(30);
      } catch (e) {
        result.errors.push(`Duplicate check against existing candidates failed: ${msg(e)}`);
      }
      const existingPeople = new Map<string, CandidatePerson[]>(existing.map((x) => [x.id, x.people]));
      const keptPending: NewCandidate[] = [];
      for (const row of rows) {
        if (row.status !== 'pending') { originals.push(row); continue; }
        const inRun = keptPending.find((o) => isSameStory(o, row));
        const prior = inRun ? undefined : existing.find((x) => isSameStory(x, row));
        if (!inRun && !prior) { keptPending.push(row); originals.push(row); continue; }
        const where = inRun ? (inRun.query || inRun.headline) : (prior!.query || prior!.headline || 'an earlier candidate');
        const added = inRun ? newPeople(inRun.people, row.people) : newPeople(existingPeople.get(prior!.id) ?? [], row.people);
        if (inRun) {
          inRun.people = [...inRun.people, ...added];
        } else if (added.length) {
          try {
            await deps.store.mergePeople(prior!.id, added);
            existingPeople.set(prior!.id, [...(existingPeople.get(prior!.id) ?? []), ...added]);
          } catch (e) {
            result.errors.push(`Merge people failed: ${msg(e)}`);
          }
        }
        duplicates.push({
          row: { ...row, status: 'filtered', rationale: `Duplicate story (also in ${where})` },
          ofKey: inRun ? inRun.url_key : null, ofId: prior ? prior.id : null,
        });
      }
    } else {
      originals.push(...rows);
    }
    const idByKey = new Map<string, string>();
    if (originals.length) {
      for (const r of await deps.store.insertCandidates(originals)) idByKey.set(r.url_key, r.id);
    }
    if (duplicates.length) {
      await deps.store.insertCandidates(duplicates.map((d) => ({ ...d.row, duplicate_of: d.ofId ?? (d.ofKey ? idByKey.get(d.ofKey) ?? null : null) })));
    }
    result.duplicates_merged = duplicates.length;
    result.candidates_created = originals.filter((r) => r.status === 'pending').length;
  } catch (e) {
    result.status = 'failed';
    result.errors.push(msg(e));
  } finally {
    await deps.store.finishRun(runId, result);
  }
  return { ...result, runId };
}
