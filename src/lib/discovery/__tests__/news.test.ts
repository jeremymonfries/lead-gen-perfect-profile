import { describe, it, expect, vi } from 'vitest';
import { BraveNewsProvider, parseBraveNews } from '../news';

describe('parseBraveNews', () => {
  it('maps fields, strips HTML and decodes entities', () => {
    const items = parseBraveNews({
      results: [{
        url: 'https://www.afr.com/a', title: 'Law firm <strong>Smith</strong> &amp; Co opens', description: 'It&#39;s a &quot;big&quot; move &lt;now&gt;',
        page_age: '2026-10-01T03:00:00', meta_url: { hostname: 'www.afr.com' }, extra_snippets: ['<b>more</b> info'],
      }],
    });
    expect(items).toEqual([{
      url: 'https://www.afr.com/a', title: 'Law firm Smith & Co opens', description: 'It\'s a "big" move <now>',
      publisher: 'afr.com', publishedAt: '2026-10-01T03:00:00.000Z', extraSnippets: ['more info'],
    }]);
  });
  it('respects explicit timezones and nulls unparseable dates', () => {
    const [a, b, c] = parseBraveNews({ results: [
      { url: 'https://a.com/1', title: 'A', page_age: '2026-10-01T10:00:00+10:00' },
      { url: 'https://a.com/2', title: 'B', page_age: 'garbage' },
      { url: 'https://a.com/3', title: 'C' },
    ] });
    expect(a.publishedAt).toBe('2026-10-01T00:00:00.000Z');
    expect(b.publishedAt).toBeNull();
    expect(c.publishedAt).toBeNull();
    expect(c.publisher).toBeNull();
    expect(c.description).toBeNull();
    expect(c.extraSnippets).toEqual([]);
  });
  it('skips rows without url/title and tolerates bad shapes', () => {
    expect(parseBraveNews({ results: [{ title: 'x' }, { url: 'https://a.com' }, 5, null, { url: 'https://ok.com', title: 'ok' }] })).toHaveLength(1);
    expect(parseBraveNews(null)).toEqual([]);
    expect(parseBraveNews({})).toEqual([]);
    expect(parseBraveNews({ results: 'x' })).toEqual([]);
  });
});

describe('BraveNewsProvider', () => {
  const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;

  it('sends expected params and headers', async () => {
    const f = vi.fn().mockResolvedValue(ok({ results: [{ url: 'https://a.com', title: 'T' }] }));
    const items = await new BraveNewsProvider('KEY', f as unknown as typeof fetch).search('new office melbourne');
    expect(items).toHaveLength(1);
    const [url, init] = f.mock.calls[0];
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe('https://api.search.brave.com/res/v1/news/search');
    expect(Object.fromEntries(u.searchParams)).toEqual({ q: 'new office melbourne', country: 'AU', search_lang: 'en', count: '20', freshness: 'pw', safesearch: 'moderate' });
    expect(init.headers).toEqual({ Accept: 'application/json', 'X-Subscription-Token': 'KEY' });
  });
  it('honours freshness and clamps count', async () => {
    const f = vi.fn().mockResolvedValue(ok({}));
    await new BraveNewsProvider('K', f as unknown as typeof fetch).search('q', { freshness: 'pm', count: 500 });
    const u = new URL(f.mock.calls[0][0]);
    expect(u.searchParams.get('count')).toBe('50');
    expect(u.searchParams.get('freshness')).toBe('pm');
  });
  it.each([
    [401, 'Brave Search rejected the API key'],
    [403, 'Brave Search rejected the API key'],
    [429, 'Brave Search rate limit or quota reached'],
    [500, 'Brave Search error 500'],
  ])('maps status %i', async (status, message) => {
    const f = vi.fn().mockResolvedValue({ ok: false, status });
    await expect(new BraveNewsProvider('K', f as unknown as typeof fetch).search('q')).rejects.toThrow(message);
  });
});
