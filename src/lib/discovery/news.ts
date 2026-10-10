import { z } from 'zod';

export interface NewsItem { url: string; title: string; description: string | null; publisher: string | null; publishedAt: string | null; extraSnippets: string[]; }
export interface NewsSearchOptions { freshness?: 'pd' | 'pw' | 'pm' | 'py'; count?: number; }
export interface NewsSearchProvider { search(query: string, opts?: NewsSearchOptions): Promise<NewsItem[]>; }

const BraveResponse = z.object({ results: z.array(z.unknown()).optional() });
const BraveResult = z.object({
  url: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullish(),
  page_age: z.string().nullish(),
  age: z.string().nullish(),
  meta_url: z.object({ hostname: z.string().nullish() }).nullish(),
  extra_snippets: z.array(z.string()).nullish(),
});

const ENTITIES: Record<string, string> = { '&amp;': '&', '&quot;': '"', '&#39;': "'", '&lt;': '<', '&gt;': '>' };
const clean = (s: string) => s.replace(/<[^>]*>/g, '').replace(/&(amp|quot|#39|lt|gt);/g, (m) => ENTITIES[m]).replace(/\s+/g, ' ').trim();

function toIso(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s.trim();
  const hasTz = /(Z|[+-]\d{2}:?\d{2})$/i.test(t);
  const d = new Date(!hasTz && /^\d{4}-\d{2}-\d{2}T/.test(t) ? `${t}Z` : t);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function parseBraveNews(json: unknown): NewsItem[] {
  const parsed = BraveResponse.safeParse(json);
  if (!parsed.success || !parsed.data.results) return [];
  const out: NewsItem[] = [];
  for (const r of parsed.data.results) {
    const p = BraveResult.safeParse(r);
    if (!p.success) continue;
    const title = clean(p.data.title);
    const url = p.data.url.trim();
    if (!title || !url) continue;
    out.push({
      url,
      title,
      description: p.data.description ? clean(p.data.description) || null : null,
      publisher: p.data.meta_url?.hostname?.replace(/^www\./, '') || null,
      publishedAt: toIso(p.data.page_age),
      extraSnippets: (p.data.extra_snippets ?? []).map(clean).filter(Boolean),
    });
  }
  return out;
}

export class BraveNewsProvider implements NewsSearchProvider {
  constructor(private apiKey: string, private fetchImpl: typeof fetch = fetch) {}

  async search(query: string, opts: NewsSearchOptions = {}): Promise<NewsItem[]> {
    const params = new URLSearchParams({
      q: query,
      country: 'AU',
      search_lang: 'en',
      count: String(Math.min(Math.max(opts.count ?? 20, 1), 50)),
      freshness: opts.freshness ?? 'pw',
      safesearch: 'moderate',
    });
    const res = await this.fetchImpl(`https://api.search.brave.com/res/v1/news/search?${params}`, {
      headers: { Accept: 'application/json', 'X-Subscription-Token': this.apiKey },
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) throw new Error('Brave Search rejected the API key');
      if (res.status === 429) throw new Error('Brave Search rate limit or quota reached');
      throw new Error(`Brave Search error ${res.status}`);
    }
    return parseBraveNews(await res.json());
  }
}
