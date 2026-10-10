import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { z } from 'zod';
import type { LLMProvider } from '@/lib/llm/provider';

export interface WebsitePerson { name: string; title: string | null; page_url: string }
export interface WebsiteLookupResult { people: WebsitePerson[]; pagesChecked: string[]; errors: string[] }

const USER_AGENT = 'PerfectProfileProspecting/1.0 (internal research; on-demand)';
const ROBOTS_TOKEN = 'perfectprofileprospecting';
const MAX_BYTES = 1_500_000;
const MAX_REDIRECTS = 3;
const MAX_TEXT = 12_000;
const MAX_PEOPLE = 15;
const LINK_RE = /team|people|leadership|our-people|about|board|partners|management|staff|who-we-are|contact/i;

/** SSRF guard: public-looking DNS hostnames only. */
export function isSafePublicHost(host: string): boolean {
  const h = host.trim().toLowerCase().replace(/\.$/, '');
  if (!h || !h.includes('.')) return false;
  if (h.includes(':') || h.startsWith('[')) return false; // IPv6 literal
  if (/^\d+(\.\d+){3}$/.test(h) || /^[\d.]+$/.test(h) || /^0x[0-9a-f]+$/i.test(h)) return false; // IPv4 literal
  if (h === 'localhost' || /\.(local|internal|localhost|test)$/.test(h)) return false;
  if (!/^[a-z0-9.-]+$/.test(h) || h.includes('..')) return false;
  return true;
}

/** Loopback, private, link-local, CGNAT, multicast/reserved and IPv4-mapped equivalents. */
export function isPrivateIp(ip: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return isPrivateIp(mapped[1]);
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const v6 = ip.toLowerCase();
  return v6 === '::' || v6 === '::1' || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6) || /^ff/.test(v6);
}

export type ResolveHost = (host: string) => Promise<string[]>;
const resolveWithDns: ResolveHost = async (host) => (await lookup(host, { all: true })).map((a) => a.address);

const siteKey = (host: string) => host.toLowerCase().replace(/^www\./, '');

interface RobotsRule { allow: boolean; path: string }

function parseRobots(text: string): RobotsRule[] {
  const groups: { agents: string[]; rules: RobotsRule[] }[] = [];
  let cur: { agents: string[]; rules: RobotsRule[] } | null = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === 'user-agent') {
      if (!cur || !lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else if ((key === 'disallow' || key === 'allow') && cur) {
      lastWasAgent = false;
      if (val) cur.rules.push({ allow: key === 'allow', path: val });
    } else lastWasAgent = false;
  }
  const specific = groups.filter((g) => g.agents.some((a) => a.includes(ROBOTS_TOKEN)));
  const chosen = specific.length ? specific : groups.filter((g) => g.agents.includes('*'));
  return chosen.flatMap((g) => g.rules);
}

function robotsAllows(rules: RobotsRule[], pathAndQuery: string): boolean {
  let best: RobotsRule | null = null;
  for (const r of rules) {
    const p = r.path.replace(/\$$/, '');
    const re = new RegExp('^' + p.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*'));
    if (!re.test(pathAndQuery)) continue;
    if (!best || p.length > best.path.length || (p.length === best.path.length && r.allow)) best = r;
  }
  return !best || best.allow;
}

async function readLimited(res: Response): Promise<string> {
  if (!res.body) return (await res.text()).slice(0, MAX_BYTES);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  try { await reader.cancel(); } catch { /* ignore */ }
  const buf = new Uint8Array(Math.min(total, MAX_BYTES));
  let off = 0;
  for (const c of chunks) {
    const slice = c.subarray(0, Math.max(0, buf.length - off));
    buf.set(slice, off);
    off += slice.length;
    if (off >= buf.length) break;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(buf);
}

interface Fetched { url: string; body: string }

/** Safe GET with manual same-site redirects. Throws Error with a readable message. */
async function safeGet(startUrl: string, fetchImpl: typeof fetch, opts: { html: boolean; resolveHost: ResolveHost | null }): Promise<Fetched> {
  let url = new URL(startUrl);
  const origin = siteKey(url.hostname);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!/^https?:$/.test(url.protocol) || !isSafePublicHost(url.hostname)) throw new Error(`Unsafe URL refused: ${url.hostname}`);
    if (siteKey(url.hostname) !== origin) throw new Error(`Redirect to a different site refused: ${url.hostname}`);
    if (opts.resolveHost && (await opts.resolveHost(url.hostname)).some(isPrivateIp)) throw new Error(`Host resolves to a private address: ${url.hostname}`);
    const res = await fetchImpl(url.toString(), {
      redirect: 'manual',
      headers: { 'User-Agent': USER_AGENT, Accept: opts.html ? 'text/html' : 'text/plain,*/*;q=0.5' },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) throw new Error(`Redirect without location from ${url}`);
      try { await res.body?.cancel(); } catch { /* ignore */ }
      url = new URL(loc, url);
      continue;
    }
    if (!res.ok) { try { await res.body?.cancel(); } catch { /* ignore */ } throw new Error(`HTTP ${res.status} for ${url}`); }
    if (opts.html) {
      const ct = res.headers.get('content-type') ?? '';
      if (!/text\/html|application\/xhtml/i.test(ct)) { try { await res.body?.cancel(); } catch { /* ignore */ } throw new Error(`Not HTML (${ct || 'unknown type'}): ${url}`); }
    }
    return { url: url.toString(), body: await readLimited(res) };
  }
  throw new Error(`Too many redirects for ${startUrl}`);
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '-', mdash: '-', rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"' };
function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return String.fromCodePoint(code); } catch { return ' '; }
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

export function htmlToText(html: string): string {
  const stripped = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|nav|footer|svg|noscript|head)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|br|tr|section|article)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return decodeEntities(stripped).replace(/[ \t\f\v ]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim().slice(0, MAX_TEXT);
}

function rankLink(path: string, text: string): number {
  const s = `${path} ${text}`.toLowerCase();
  if (/leadership|\bteam\b|our-people|\bpeople\b|partners|board/.test(s)) return 0;
  if (/management|staff|who-we-are|about/.test(s)) return 1;
  return 2; // contact
}

function discoverLinks(html: string, base: URL): string[] {
  const found = new Map<string, number>();
  const re = /<a\s[^>]*?href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    let u: URL;
    try { u = new URL(decodeEntities(m[2]).trim(), base); } catch { continue; }
    if (!/^https?:$/.test(u.protocol) || siteKey(u.hostname) !== siteKey(base.hostname)) continue;
    if (/\.(pdf|jpe?g|png|gif|webp|svg|zip|docx?|xlsx?|mp4)$/i.test(u.pathname)) continue;
    u.hash = '';
    const anchor = decodeEntities(m[3].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    if (!LINK_RE.test(u.pathname) && !LINK_RE.test(anchor)) continue;
    const key = u.toString();
    if (key === base.toString() || u.pathname === '/' || u.pathname === base.pathname) continue;
    const rank = rankLink(u.pathname, anchor);
    if (!found.has(key) || found.get(key)! > rank) found.set(key, rank);
  }
  return [...found.entries()].sort((a, b) => a[1] - b[1]).map(([u]) => u);
}

const PeopleOut = z.object({
  people: z.array(z.object({ name: z.string().min(1), title: z.string().nullable(), page_url: z.string() })),
});

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['people'],
  properties: {
    people: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'title', 'page_url'],
        properties: { name: { type: 'string' }, title: { anyOf: [{ type: 'string' }, { type: 'null' }] }, page_url: { type: 'string' } },
      },
    },
  },
} as const;

const SYSTEM = `You extract people named on a company's own public website pages.
Rules:
- Only list people whose full name appears in the supplied page text. Never invent or infer people, names or job titles.
- title is the job title stated next to the person on the page; use null if none is stated.
- page_url must be exactly one of the page URLs supplied (the page where the person appears).
- Do NOT extract email addresses or phone numbers.
- Return at most ${MAX_PEOPLE} people. Prioritise any preferred roles given, then senior staff, then HR / People & Culture, marketing, office management and executive assistants.
- If no people are named, return an empty list.`;

function validate(raw: unknown, allowed: Set<string>): WebsitePerson[] {
  const parsed = PeopleOut.parse(raw);
  const seen = new Set<string>();
  const out: WebsitePerson[] = [];
  for (const p of parsed.people) {
    const name = p.name.trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key) || !allowed.has(p.page_url)) continue;
    seen.add(key);
    out.push({ name, title: p.title?.trim() || null, page_url: p.page_url });
    if (out.length >= MAX_PEOPLE) break;
  }
  return out;
}

export async function findPeopleOnWebsite(
  domain: string,
  opts: { llm: LLMProvider; fetchImpl?: typeof fetch; preferredRoles?: string[]; maxPages?: number; resolveHost?: ResolveHost | null },
): Promise<WebsiteLookupResult> {
  const result: WebsiteLookupResult = { people: [], pagesChecked: [], errors: [] };
  const fetchImpl = opts.fetchImpl ?? fetch;
  // Real DNS check by default; tests that inject fetch skip it unless they pass a resolver.
  const resolveHost = opts.resolveHost !== undefined ? opts.resolveHost : opts.fetchImpl ? null : resolveWithDns;
  const maxPages = Math.max(1, opts.maxPages ?? 4);

  const host = domain.trim().toLowerCase().replace(/^[a-z]+:\/\//, '').split(/[/?#]/)[0];
  if (!isSafePublicHost(host)) { result.errors.push(`Unsafe or invalid domain: ${domain}`); return result; }

  // robots.txt (failure = allowed)
  let rules: RobotsRule[] = [];
  try {
    const robots = await safeGet(`https://${host}/robots.txt`, fetchImpl, { html: false, resolveHost });
    rules = parseRobots(robots.body);
  } catch { /* treat as allowed */ }

  const allowed = (u: string) => { const x = new URL(u); return robotsAllows(rules, x.pathname + x.search); };

  const texts: { url: string; text: string }[] = [];
  const fetchPage = async (url: string): Promise<Fetched | null> => {
    if (!allowed(url)) { result.errors.push(`Blocked by robots.txt: ${url}`); return null; }
    try {
      const page = await safeGet(url, fetchImpl, { html: true, resolveHost });
      result.pagesChecked.push(page.url);
      const text = htmlToText(page.body);
      if (text) texts.push({ url: page.url, text });
      return page;
    } catch (e) {
      result.errors.push(e instanceof Error ? e.message : String(e));
      return null;
    }
  };

  const home = await fetchPage(`https://${host}/`);
  if (home) {
    const links = discoverLinks(home.body, new URL(home.url));
    for (const link of links) {
      if (result.pagesChecked.length >= maxPages) break;
      if (result.pagesChecked.includes(link)) continue;
      await fetchPage(link);
    }
  }

  if (!texts.length) {
    if (!result.errors.length) result.errors.push('No readable pages found');
    return result;
  }

  const allowedUrls = new Set(texts.map((t) => t.url));
  const user = [
    opts.preferredRoles?.length ? `Preferred roles: ${opts.preferredRoles.join(', ')}` : 'Preferred roles: none specified',
    ...texts.map((t) => `=== PAGE ${t.url} ===\n${t.text}`),
    'Extract the named people now.',
  ].join('\n\n');

  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await opts.llm.complete({ system: SYSTEM, user, jsonSchema: SCHEMA as unknown as Record<string, unknown>, maxTokens: 2000 });
      result.people = validate(raw, allowedUrls);
      return result;
    } catch (e) {
      lastErr = e;
    }
  }
  result.errors.push(`Could not extract people: ${lastErr instanceof Error ? lastErr.message : 'invalid model output'}`);
  return result;
}
