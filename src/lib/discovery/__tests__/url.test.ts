import { describe, it, expect } from 'vitest';
import { cleanDomain, normalizeUrl } from '../url';

describe('normalizeUrl', () => {
  it('lowercases host, strips www, protocol, hash, trailing slash', () => {
    expect(normalizeUrl('https://WWW.ABC.net.au/news/x/#top')).toBe('abc.net.au/news/x');
  });
  it('drops tracking params and sorts the rest', () => {
    expect(normalizeUrl('http://abc.net.au/news/x?utm_source=a&id=1&fbclid=z&b=2&gclid=q&mc_cid=1&mc_eid=2')).toBe('abc.net.au/news/x?b=2&id=1');
    expect(normalizeUrl('https://a.com/p?z=1&a=2')).toBe(normalizeUrl('https://a.com/p?a=2&z=1'));
  });
  it('treats http/https and www variants as equal', () => {
    expect(normalizeUrl('http://www.a.com/x/')).toBe(normalizeUrl('https://a.com/x'));
  });
  it('lowercases invalid URLs', () => {
    expect(normalizeUrl('  Not A URL ')).toBe('not a url');
  });
});

describe('cleanDomain', () => {
  it('cleans protocol, www and path', () => {
    expect(cleanDomain('https://www.Acme.com.au/about?x=1')).toBe('acme.com.au');
    expect(cleanDomain('acme.com.au')).toBe('acme.com.au');
  });
  it('returns null for empty', () => {
    expect(cleanDomain('')).toBeNull();
    expect(cleanDomain('  ')).toBeNull();
    expect(cleanDomain(null)).toBeNull();
    expect(cleanDomain(undefined)).toBeNull();
  });
});
