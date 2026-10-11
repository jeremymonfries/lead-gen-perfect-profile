import { describe, expect, it, vi } from 'vitest';
import { ClaudeWebSearchProvider, parsePageAge } from '../claude-search';
import type { LLMUsage } from '@/lib/llm/provider';

const daysAgo = (n: number) => `${n} days ago`;
const NOW = new Date('2026-10-11T00:00:00.000Z');
const mk = (client: any, extra: object = {}) => new ClaudeWebSearchProvider({ model: 'm', client, now: () => NOW, ...extra }); // eslint-disable-line @typescript-eslint/no-explicit-any
const result = (url: string, title: string, page_age: string | null) => ({ type: 'web_search_result', url, title, page_age, encrypted_content: 'x' });

function fake(content: unknown[], usage: object = { input_tokens: 100, output_tokens: 50, server_tool_use: { web_search_requests: 1 } }) {
  const create = vi.fn().mockResolvedValue({ model: 'claude-haiku-5-5', content, usage, stop_reason: 'end_turn' });
  return { create, client: { messages: { create } } };
}

describe('ClaudeWebSearchProvider', () => {
  it('builds NewsItems, preferring Claude\'s line and falling back to cited_text', async () => {
    const { client } = fake([
      { type: 'server_tool_use', name: 'web_search' },
      { type: 'web_search_tool_result', content: [
        result('https://www.acme.com.au/a', 'Acme opens office', daysAgo(2)),
        result('https://news.example.com/b', 'Beta hires', daysAgo(3)),
        result('https://c.example.com/c', 'Undated', null),
      ] },
      { type: 'text', text: 'https://www.acme.com.au/a — Acme opened a new Collins St office.', citations: [
        { type: 'web_search_result_location', url: 'https://news.example.com/b', title: 'Beta hires', cited_text: 'Beta will hire 40 staff.' },
      ] },
    ]);
    const items = await new ClaudeWebSearchProvider({ model: 'claude-haiku-5-5', client, keepUndated: true }).search('q');
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ url: 'https://www.acme.com.au/a', title: 'Acme opens office', publisher: 'acme.com.au', description: 'Acme opened a new Collins St office.', extraSnippets: [] });
    expect(items[0].publishedAt).toMatch(/^\d{4}-\d\d-\d\dT/);
    expect(items[1].description).toBe('Beta will hire 40 staff.');
    expect(items[2]).toMatchObject({ publishedAt: null, description: null });
  });

  it('drops stale results by default (45 days) and keeps fresh ones with correct ISO', async () => {
    const { client } = fake([{ type: 'web_search_tool_result', content: [result('https://a.com/1', 'Old', '156 days ago'), result('https://a.com/2', 'New', '20 days ago')] }]);
    const items = await mk(client).search('q');
    expect(items.map((i) => i.title)).toEqual(['New']);
    expect(items[0].publishedAt).toBe(new Date(NOW.getTime() - 20 * 86_400_000).toISOString());
  });

  it('drops undated by default and keeps them with keepUndated', async () => {
    const content = [{ type: 'web_search_tool_result', content: [result('https://a.com/1', 'Undated', null)] }];
    expect(await mk(fake(content).client).search('q')).toEqual([]);
    const items = await mk(fake(content).client, { keepUndated: true }).search('q');
    expect(items).toHaveLength(1);
    expect(items[0].publishedAt).toBeNull();
  });

  it("prefers Claude's stated date over page_age and strips it from the description", async () => {
    const { client } = fake([
      { type: 'web_search_tool_result', content: [result('https://a.com/1', 'A', '400 days ago'), result('https://a.com/2', 'B', '2 days ago')] },
      { type: 'text', text: 'https://a.com/1 — 2026-10-05 — Acme did a thing.\nhttps://a.com/2 — 2027-01-01 — Future date ignored.' },
    ]);
    const items = await mk(client).search('q');
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ publishedAt: '2026-10-05T00:00:00.000Z', description: 'Acme did a thing.' });
    expect(items[1].publishedAt).toBe(new Date(NOW.getTime() - 2 * 86_400_000).toISOString());
  });

  it('puts month and year from now in the query', async () => {
    const { client, create } = fake([{ type: 'web_search_tool_result', content: [] }]);
    await mk(client).search('Melbourne company opens new office');
    expect(create.mock.calls[0][0].messages[0].content).toContain('Melbourne company opens new office (October 2026)');
  });

  it('throws on an error tool result', async () => {
    const { client } = fake([{ type: 'web_search_tool_result', content: { type: 'web_search_tool_result_error', error_code: 'max_uses_exceeded' } }]);
    await expect(new ClaudeWebSearchProvider({ model: 'm', client }).search('q')).rejects.toThrow('Web search error: max_uses_exceeded');
  });

  it('reports usage including web_search_requests', async () => {
    const { client } = fake([{ type: 'web_search_tool_result', content: [] }]);
    const onUsage = vi.fn<(u: LLMUsage) => void>();
    await new ClaudeWebSearchProvider({ model: 'claude-haiku-5-5', onUsage, client }).search('q');
    expect(onUsage).toHaveBeenCalledWith({ model: 'claude-haiku-5-5', input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, web_search_requests: 1 });
  });

  it('sends the web search tool with AU location and no structured output format', async () => {
    const { client, create } = fake([{ type: 'web_search_tool_result', content: [] }]);
    await new ClaudeWebSearchProvider({ model: 'claude-haiku-5-5', client }).search('Melbourne rebrand');
    const p = create.mock.calls[0][0];
    expect(p.model).toBe('claude-haiku-5-5');
    expect(p.max_tokens).toBe(1500);
    expect(p.tools).toEqual([{ type: 'web_search_20250305', name: 'web_search', max_uses: 1, user_location: { type: 'approximate', city: 'Melbourne', region: 'Victoria', country: 'AU', timezone: 'Australia/Melbourne' } }]);
    expect(p.output_config).toEqual({ effort: 'low' });
    expect(p.output_config.format).toBeUndefined();
    expect(p.thinking).toBeUndefined();
    expect(p.messages[0].content).toContain('Melbourne rebrand');
  });
});

describe('parsePageAge', () => {
  const iso = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
  const D = 86_400_000;
  it('handles relative units', () => {
    expect(parsePageAge('5 days ago', NOW)).toBe(iso(5 * D));
    expect(parsePageAge('2 weeks ago', NOW)).toBe(iso(14 * D));
    expect(parsePageAge('3 months ago', NOW)).toBe(iso(90 * D));
    expect(parsePageAge('2 years ago', NOW)).toBe(iso(730 * D));
    expect(parsePageAge('4 hours ago', NOW)).toBe(iso(4 * 3_600_000));
    expect(parsePageAge('30 minutes ago', NOW)).toBe(iso(30 * 60_000));
  });
  it('handles a/an, yesterday, today', () => {
    expect(parsePageAge('a day ago', NOW)).toBe(iso(D));
    expect(parsePageAge('an hour ago', NOW)).toBe(iso(3_600_000));
    expect(parsePageAge('yesterday', NOW)).toBe(iso(D));
    expect(parsePageAge('today', NOW)).toBe(NOW.toISOString());
  });
  it('handles absolute dates', () => {
    expect(parsePageAge('2025-04-30', NOW)).toBe('2025-04-30T00:00:00.000Z');
    expect(parsePageAge('April 30, 2025', NOW)).toMatch(/^2025-04-(29|30)T/);
  });
  it('returns null for garbage', () => {
    expect(parsePageAge('soon-ish', NOW)).toBeNull();
    expect(parsePageAge('', NOW)).toBeNull();
    expect(parsePageAge(null, NOW)).toBeNull();
    expect(parsePageAge(undefined, NOW)).toBeNull();
  });
});
