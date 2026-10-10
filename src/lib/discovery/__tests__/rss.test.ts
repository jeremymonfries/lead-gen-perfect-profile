import { describe, it, expect, vi } from 'vitest';
import { matchesKeywords, parseFeed, RssFeedProvider } from '../rss';

const RSS = `<?xml version="1.0"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel>
<title>Feed</title><link>https://www.example.com/</link>
<item>
  <title><![CDATA[Smith & Co appoints <b>new</b> partner]]></title>
  <link>/news/smith</link>
  <description><![CDATA[<p>Jane Doe joins as partner &amp; head of tax.</p><script>x()</script>]]></description>
  <pubDate>Wed, 08 Oct 2026 10:00:00 +1100</pubDate>
  <dc:creator>Reporter</dc:creator>
</item>
<item>
  <title>Escaped &amp; &#39;quoted&#39;</title>
  <link>https://www.example.com/escaped</link>
  <content:encoded>&lt;p&gt;Hello&amp;nbsp;&lt;em&gt;world&lt;/em&gt;&lt;/p&gt;</content:encoded>
</item>
<item><title>No link</title></item>
<item><link>https://www.example.com/no-title</link></item>
<item><title>Long</title><link>https://www.example.com/long</link><description>${'a'.repeat(700)}</description></item>
</channel></rss>`;

const ATOM = `<feed xmlns="http://www.w3.org/2005/Atom">
<title>Atom</title>
<entry>
  <title type="html">Acme &amp;amp; Co moves</title>
  <link rel="self" href="https://blog.example.org/self"/>
  <link rel="alternate" href="/posts/acme"/>
  <summary>Short &lt;b&gt;summary&lt;/b&gt;</summary>
  <content type="html">Full content</content>
  <published>2026-10-01T00:00:00Z</published>
  <updated>2026-10-02T00:00:00Z</updated>
</entry>
<entry><title>Only updated</title><link href="https://blog.example.org/u"/><updated>2026-10-03T00:00:00Z</updated><content>Body text</content></entry>
</feed>`;

describe('parseFeed', () => {
  it('parses RSS 2.0 with CDATA, entities, HTML and relative links', () => {
    const items = parseFeed(RSS, 'https://www.example.com/feed.xml');
    expect(items).toHaveLength(3);
    expect(items[0]).toEqual({
      url: 'https://www.example.com/news/smith', title: 'Smith & Co appoints new partner', description: 'Jane Doe joins as partner & head of tax.',
      publisher: 'example.com', publishedAt: '2026-10-07T23:00:00.000Z', extraSnippets: [],
    });
    expect(items[1]).toMatchObject({ title: "Escaped & 'quoted'", description: 'Hello world', publishedAt: null });
    expect(items[2].description).toHaveLength(600);
  });
  it('parses Atom preferring rel=alternate and summary over content', () => {
    const items = parseFeed(ATOM, 'https://blog.example.org/atom');
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ url: 'https://blog.example.org/posts/acme', title: 'Acme & Co moves', description: 'Short summary', publishedAt: '2026-10-01T00:00:00.000Z', publisher: 'blog.example.org' });
    expect(items[1]).toMatchObject({ url: 'https://blog.example.org/u', description: 'Body text', publishedAt: '2026-10-03T00:00:00.000Z' });
  });
  it('returns an empty list for a valid empty feed and throws for non-feeds', () => {
    expect(parseFeed('<rss><channel></channel></rss>', 'https://a.com/f')).toEqual([]);
    expect(() => parseFeed('<html><body>hi</body></html>', 'https://a.com/f')).toThrow('Not a valid RSS/Atom feed');
    expect(() => parseFeed('', 'https://a.com/f')).toThrow('Not a valid RSS/Atom feed');
  });
});

describe('RssFeedProvider', () => {
  it('sends headers and parses the response', async () => {
    const f = vi.fn(async () => new Response(RSS, { status: 200 }));
    const items = await new RssFeedProvider(f as unknown as typeof fetch).fetchFeed('https://www.example.com/feed.xml');
    expect(items).toHaveLength(3);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://www.example.com/feed.xml');
    expect(init.headers).toMatchObject({ 'User-Agent': 'PerfectProfileProspecting/1.0 (internal feed reader)', Accept: expect.stringContaining('application/atom+xml') });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
  it('throws on a non-OK status', async () => {
    const f = vi.fn(async () => new Response('no', { status: 503 }));
    await expect(new RssFeedProvider(f as unknown as typeof fetch).fetchFeed('https://a.com/f')).rejects.toThrow('Feed error 503');
  });
});

describe('matchesKeywords', () => {
  const it1 = { url: 'u', title: 'Firm Appoints CEO', description: 'Joins from Sydney', publisher: null, publishedAt: null, extraSnippets: [] };
  it('matches case-insensitively on title and description', () => {
    expect(matchesKeywords(it1, ['appoints'])).toBe(true);
    expect(matchesKeywords(it1, ['nope', 'SYDNEY'])).toBe(true);
    expect(matchesKeywords(it1, ['nope'])).toBe(false);
  });
  it('passes everything with no keywords', () => {
    expect(matchesKeywords(it1, [])).toBe(true);
    expect(matchesKeywords({ ...it1, description: null }, ['x'])).toBe(false);
  });
});
