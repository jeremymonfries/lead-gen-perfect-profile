import { describe, it, expect, vi } from 'vitest';
import { findPeopleOnWebsite, isPrivateIp, isSafePublicHost } from '../website';
import type { LLMProvider } from '@/lib/llm/provider';

const html = (body: string) => new Response(`<html><body>${body}</body></html>`, { status: 200, headers: { 'content-type': 'text/html' } });
const notFound = () => new Response('nope', { status: 404 });
const prov = (out: unknown): LLMProvider & { complete: ReturnType<typeof vi.fn> } => ({ complete: vi.fn().mockResolvedValue(out) });

function mockFetch(routes: Record<string, () => Response>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const u = String(input);
    const r = routes[u];
    return r ? r() : notFound();
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

describe('isSafePublicHost', () => {
  it('accepts public hostnames', () => {
    expect(isSafePublicHost('acme.com.au')).toBe(true);
    expect(isSafePublicHost('www.acme.com')).toBe(true);
  });
  it('rejects unsafe hosts', () => {
    for (const h of ['localhost', 'intranet', '127.0.0.1', '10.0.0.5', '[::1]', '::1', 'foo.local', 'x.internal', 'a.localhost', 'a.test', '', '2130706433', 'a b.com'])
      expect(isSafePublicHost(h), h).toBe(false);
  });
});

describe('findPeopleOnWebsite', () => {
  const home = '<a href="/about">About us</a><a href="/team">Our Team</a><a href="/products">Products</a><a href="https://other.com/team">ext</a>';

  it('discovers team links, caps pages, validates and dedupes LLM output', async () => {
    const f = mockFetch({
      'https://acme.com.au/robots.txt': () => new Response('User-agent: *\nAllow: /', { status: 200 }),
      'https://acme.com.au/': () => html(home),
      'https://acme.com.au/team': () => html('<h1>Team</h1><p>Sam Lee, People &amp; Culture Manager</p>'),
      'https://acme.com.au/about': () => html('<p>About</p>'),
    });
    const llm = prov({ people: [
      { name: 'Sam Lee', title: 'People & Culture Manager', page_url: 'https://acme.com.au/team' },
      { name: 'sam lee', title: null, page_url: 'https://acme.com.au/team' },
      { name: 'Invented Person', title: 'CEO', page_url: 'https://elsewhere.com/team' },
    ] });
    const r = await findPeopleOnWebsite('acme.com.au', { llm, fetchImpl: f, preferredRoles: ['Office Manager'], maxPages: 2 });
    expect(r.pagesChecked).toEqual(['https://acme.com.au/', 'https://acme.com.au/team']);
    expect(r.people).toEqual([{ name: 'Sam Lee', title: 'People & Culture Manager', page_url: 'https://acme.com.au/team' }]);
    expect(llm.complete.mock.calls[0][0].user).toContain('Office Manager');
    expect(llm.complete.mock.calls[0][0].user).toContain('People & Culture Manager');
  });

  it('respects robots.txt disallow', async () => {
    const f = mockFetch({
      'https://acme.com.au/robots.txt': () => new Response('User-agent: *\nDisallow: /team', { status: 200 }),
      'https://acme.com.au/': () => html(home),
      'https://acme.com.au/team': () => html('<p>Secret</p>'),
      'https://acme.com.au/about': () => html('<p>About</p>'),
    });
    const r = await findPeopleOnWebsite('acme.com.au', { llm: prov({ people: [] }), fetchImpl: f });
    expect(r.pagesChecked).not.toContain('https://acme.com.au/team');
    expect(r.errors.some((e) => /robots/.test(e))).toBe(true);
    expect(f.mock.calls.map((c) => String(c[0]))).not.toContain('https://acme.com.au/team');
  });

  it('refuses redirects to another host', async () => {
    const f = mockFetch({
      'https://acme.com.au/': () => new Response(null, { status: 302, headers: { location: 'https://evil.com/' } }),
    });
    const llm = prov({ people: [] });
    const r = await findPeopleOnWebsite('acme.com.au', { llm, fetchImpl: f });
    expect(r.people).toEqual([]);
    expect(r.errors.join(' ')).toMatch(/different site/);
    expect(llm.complete).not.toHaveBeenCalled();
  });

  it('allows www redirect on same site and rejects unsafe domain', async () => {
    const f = mockFetch({
      'https://acme.com.au/': () => new Response(null, { status: 301, headers: { location: 'https://www.acme.com.au/' } }),
      'https://www.acme.com.au/': () => html('<p>Hi</p>'),
    });
    const r = await findPeopleOnWebsite('acme.com.au', { llm: prov({ people: [] }), fetchImpl: f });
    expect(r.pagesChecked).toEqual(['https://www.acme.com.au/']);
    const bad = await findPeopleOnWebsite('127.0.0.1', { llm: prov({ people: [] }), fetchImpl: f });
    expect(bad.errors.length).toBe(1);
  });

  it('retries once on invalid LLM output then reports an error', async () => {
    const f = mockFetch({ 'https://acme.com.au/': () => html('<p>Hello</p>') });
    const llm = prov({ nope: 1 });
    const r = await findPeopleOnWebsite('acme.com.au', { llm, fetchImpl: f });
    expect(llm.complete).toHaveBeenCalledTimes(2);
    expect(r.people).toEqual([]);
    expect(r.errors.join(' ')).toMatch(/Could not extract/);
  });
});

describe('private address guard', () => {
  it('flags private, loopback and mapped addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1']) expect(isPrivateIp(ip)).toBe(true);
    for (const ip of ['8.8.8.8', '203.0.113.9', '172.32.0.1', '2606:4700::1111']) expect(isPrivateIp(ip)).toBe(false);
  });
  it('refuses a public-looking domain that resolves privately', async () => {
    const fetchImpl = vi.fn();
    const llm = { complete: vi.fn() };
    const r = await findPeopleOnWebsite('evil.example.com', { llm, fetchImpl: fetchImpl as unknown as typeof fetch, resolveHost: async () => ['127.0.0.1'] });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(r.errors.join(' ')).toMatch(/private address/);
  });
});
