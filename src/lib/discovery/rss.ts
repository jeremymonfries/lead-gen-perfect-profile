import type { NewsItem } from './news';

export interface FeedSource { name: string; url: string }
export interface FeedProvider { fetchFeed(url: string): Promise<NewsItem[]> }

const MAX_BYTES = 2_000_000;
const MAX_DESC = 600;
const NAMED: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };

const decode = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
  if (e[0] === '#') {
    const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    try { return Number.isFinite(n) ? String.fromCodePoint(n) : m; } catch { return m; }
  }
  return NAMED[e.toLowerCase()] ?? m;
});
const CDATA = /<!\[CDATA\[([\s\S]*?)\]\]>/g;
const toText = (inner: string) => {
  const hasCdata = /<!\[CDATA\[/.test(inner);
  const html = hasCdata ? inner.replace(CDATA, (_, c: string) => c) : decode(inner);
  return decode(html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
};

function inner(block: string, name: string): string | null {
  const n = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)</${n}\\s*>`, 'i').exec(block);
  return m ? m[1] : null;
}
const text = (block: string, ...names: string[]) => {
  for (const n of names) {
    const v = inner(block, n);
    const t = v === null ? '' : toText(v);
    if (t) return t;
  }
  return '';
};
const attr = (tag: string, name: string) => {
  const m = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(tag);
  return m ? decode(m[2] ?? m[3] ?? '') : null;
};

function toIso(s: string): string | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function resolve(href: string, base: string): string | null {
  if (!href.trim()) return null;
  try {
    const u = new URL(href.trim(), base);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch { return null; }
}

function linkOf(block: string): string {
  const plain = inner(block, 'link');
  if (plain !== null) {
    const t = toText(plain);
    if (t) return t;
  }
  const tags = [...block.matchAll(/<link\s[^>]*>/gi)].map((m) => m[0]).filter((t) => attr(t, 'href'));
  const alt = tags.find((t) => (attr(t, 'rel') ?? 'alternate').toLowerCase() === 'alternate') ?? tags.find((t) => !/rel\s*=\s*["']self["']/i.test(t));
  if (alt) return attr(alt, 'href') ?? '';
  const guid = text(block, 'guid');
  return /^https?:\/\//i.test(guid) ? guid : '';
}

export function parseFeed(xml: string, feedUrl: string): NewsItem[] {
  const src = xml.replace(/<!--[\s\S]*?-->/g, '');
  if (!/<(rss|feed|rdf:RDF)[\s>]/i.test(src)) throw new Error('Not a valid RSS/Atom feed');
  let host: string | null = null;
  try { host = new URL(feedUrl).hostname.replace(/^www\./, '') || null; } catch { /* keep null */ }
  const blocks = [...src.matchAll(/<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1\s*>/gi)].map((m) => m[2]);
  const out: NewsItem[] = [];
  for (const b of blocks) {
    const title = text(b, 'title');
    const link = resolve(linkOf(b), feedUrl);
    if (!title || !link) continue;
    const desc = text(b, 'description', 'summary', 'content:encoded', 'content').slice(0, MAX_DESC).trim();
    out.push({ url: link, title, description: desc || null, publisher: host, publishedAt: toIso(text(b, 'pubDate', 'published', 'updated', 'dc:date')), extraSnippets: [] });
  }
  return out;
}

export function matchesKeywords(item: NewsItem, keywords: string[]): boolean {
  const kws = keywords.map((k) => k.trim().toLowerCase()).filter(Boolean);
  if (!kws.length) return true;
  const hay = `${item.title} ${item.description ?? ''}`.toLowerCase();
  return kws.some((k) => hay.includes(k));
}

async function readLimited(res: Response): Promise<string> {
  if (!res.body) return (await res.text()).slice(0, MAX_BYTES);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let out = '';
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    out += dec.decode(value, { stream: true });
    if (total >= MAX_BYTES) { await reader.cancel().catch(() => {}); break; }
  }
  return out + dec.decode();
}

export class RssFeedProvider implements FeedProvider {
  constructor(private fetchImpl: typeof fetch = fetch) {}

  async fetchFeed(url: string): Promise<NewsItem[]> {
    const res = await this.fetchImpl(url, {
      headers: { 'User-Agent': 'PerfectProfileProspecting/1.0 (internal feed reader)', Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Feed error ${res.status}`);
    return parseFeed(await readLimited(res), url);
  }
}
