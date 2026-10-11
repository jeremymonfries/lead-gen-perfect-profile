import Anthropic from '@anthropic-ai/sdk';
import type { LLMUsage } from '@/lib/llm/provider';
import type { NewsItem, NewsSearchOptions, NewsSearchProvider } from './news';
import { normalizeUrl } from './url';

interface MessagesClient { messages: { create(params: any): Promise<any> } } // eslint-disable-line @typescript-eslint/no-explicit-any

const DAY = 86_400_000;

const SYSTEM = 'You find recent Australian business news using the web search tool. Use only facts that appear in the search results. Do not invent or infer details that the results do not state.';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const prompt = (query: string, now: Date) =>
  `Run exactly one web search for recent Australian business news (published in the last 30 days) matching: ${query} (${MONTHS[now.getUTCMonth()]} ${now.getUTCFullYear()})\n\n` +
  'Then reply with one line per relevant result, in the form:\n<url> — <YYYY-MM-DD or unknown> — <one factual sentence from the result>\n' +
  'Use the article\'s publication date, or "unknown" if the result does not state it. No other text.';

const UNIT_MS: Record<string, number> = { minute: 60_000, hour: 3_600_000, day: DAY, week: 7 * DAY, month: 30 * DAY, year: 365 * DAY };

/** Converts the search tool's relative ("156 days ago") or absolute page_age into an ISO string, or null. */
export function parsePageAge(pageAge: string | null | undefined, now: Date): string | null {
  const s = (pageAge ?? '').trim().toLowerCase();
  if (!s) return null;
  if (s === 'today') return now.toISOString();
  if (s === 'yesterday') return new Date(now.getTime() - DAY).toISOString();
  const m = s.match(/^(an?|\d+)\s+(minute|hour|day|week|month|year)s?\s+ago$/);
  if (m) {
    const n = m[1] === 'a' || m[1] === 'an' ? 1 : Number(m[1]);
    return new Date(now.getTime() - n * UNIT_MS[m[2]]).toISOString();
  }
  const t = Date.parse(pageAge!.trim());
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

const parseStatedDate = (s: string, now: Date): string | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const t = Date.parse(`${s}T00:00:00Z`);
  if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== s || t > now.getTime()) return null;
  return new Date(t).toISOString();
};

const hostname = (url: string): string | null => {
  try { return new URL(url).hostname.replace(/^www\./, '') || null; } catch { return null; }
};

const keyOf = (url: string) => { try { return normalizeUrl(url); } catch { return url.trim(); } };

export class ClaudeWebSearchProvider implements NewsSearchProvider {
  private model: string;
  private onUsage?: (u: LLMUsage) => void;
  private client?: MessagesClient;

  private maxAgeDays: number;
  private keepUndated: boolean;
  private nowFn: () => Date;

  constructor(opts: { model: string; onUsage?: (u: LLMUsage) => void; client?: MessagesClient; maxAgeDays?: number; keepUndated?: boolean; now?: () => Date }) {
    this.maxAgeDays = opts.maxAgeDays ?? 45;
    this.keepUndated = opts.keepUndated ?? false;
    this.nowFn = opts.now ?? (() => new Date());
    this.model = opts.model;
    this.onUsage = opts.onUsage;
    this.client = opts.client;
  }

  private getClient(): MessagesClient {
    if (!this.client) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
      this.client = new Anthropic({ apiKey }) as unknown as MessagesClient;
    }
    return this.client;
  }

  async search(query: string, _opts: NewsSearchOptions = {}): Promise<NewsItem[]> {
    void _opts;
    const nowDate = this.nowFn();
    const res = await this.getClient().messages.create({
      model: this.model,
      max_tokens: 1500,
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt(query, nowDate) }],
      tools: [{
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 1,
        user_location: { type: 'approximate', city: 'Melbourne', region: 'Victoria', country: 'AU', timezone: 'Australia/Melbourne' },
      }],
      output_config: { effort: 'low' },
    });

    this.onUsage?.({
      model: res.model ?? this.model,
      input_tokens: res.usage?.input_tokens ?? 0,
      output_tokens: res.usage?.output_tokens ?? 0,
      cache_read_input_tokens: res.usage?.cache_read_input_tokens ?? 0,
      cache_creation_input_tokens: res.usage?.cache_creation_input_tokens ?? 0,
      web_search_requests: res.usage?.server_tool_use?.web_search_requests ?? 0,
    });

    // pause_turn: use whatever arrived; never loop.
    const blocks: any[] = Array.isArray(res.content) ? res.content : []; // eslint-disable-line @typescript-eslint/no-explicit-any
    const results: { url: string; title: string; page_age?: string | null }[] = [];
    for (const b of blocks) {
      if (b?.type !== 'web_search_tool_result') continue;
      if (!Array.isArray(b.content)) throw new Error(`Web search error: ${b.content?.error_code ?? 'unknown'}`);
      for (const r of b.content) {
        if (r?.type === 'web_search_result' && typeof r.url === 'string' && r.url && typeof r.title === 'string' && r.title.trim()) results.push(r);
      }
    }

    // Claude's per-URL lines and citations.
    const lines = new Map<string, string>();
    const dates = new Map<string, string>();
    const cites = new Map<string, string>();
    for (const b of blocks) {
      if (b?.type !== 'text') continue;
      for (const raw of String(b.text ?? '').split('\n')) {
        const m = raw.trim().replace(/^[-*•\d.)\s]+(?=https?:)/, '').match(/^<?(https?:\/\/[^\s>]+)>?\s*[—–-]+\s*(.+)$/);
        if (!m || lines.has(keyOf(m[1]))) continue;
        let text = m[2].trim();
        const d = text.match(/^(\d{4}-\d{2}-\d{2}|unknown)\s*[—–-]+\s*(.+)$/i);
        if (d) {
          const iso = parseStatedDate(d[1], nowDate);
          if (iso) dates.set(keyOf(m[1]), iso);
          text = d[2].trim();
        }
        lines.set(keyOf(m[1]), text);
      }
      for (const c of Array.isArray(b.citations) ? b.citations : []) {
        if (c?.type === 'web_search_result_location' && typeof c.url === 'string' && c.cited_text && !cites.has(keyOf(c.url))) cites.set(keyOf(c.url), String(c.cited_text).trim());
      }
    }

    const now = nowDate.getTime();
    const out: NewsItem[] = [];
    const seen = new Set<string>();
    for (const r of results) {
      const key = keyOf(r.url);
      if (seen.has(key)) continue;
      seen.add(key);
      const publishedAt = dates.get(key) ?? parsePageAge(r.page_age, nowDate);
      if (publishedAt === null) { if (!this.keepUndated) continue; }
      else if (now - Date.parse(publishedAt) > this.maxAgeDays * DAY) continue;
      out.push({
        url: r.url,
        title: r.title.trim(),
        publisher: hostname(r.url),
        publishedAt,
        description: lines.get(key) || cites.get(key) || null,
        extraSnippets: [],
      });
    }
    return out;
  }
}
