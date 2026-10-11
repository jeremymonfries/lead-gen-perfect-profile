import { describe, expect, it, vi } from 'vitest';
import { costUsd, isLlmModel, LLM_MODELS } from '../models';
import { withModel, withUsage, type LLMProvider, type LLMUsage } from '../provider';

const base = { system: 's', user: 'u', jsonSchema: {} };

describe('withModel', () => {
  it('injects the model when the request has none', async () => {
    const complete = vi.fn().mockResolvedValue({});
    await withModel({ complete } as LLMProvider, 'claude-haiku-5-5').complete(base);
    expect(complete).toHaveBeenCalledWith({ ...base, model: 'claude-haiku-5-5' });
  });
  it('does not override an explicit model', async () => {
    const complete = vi.fn().mockResolvedValue({});
    await withModel({ complete } as LLMProvider, 'claude-haiku-5-5').complete({ ...base, model: 'claude-opus-5-5' });
    expect(complete).toHaveBeenCalledWith({ ...base, model: 'claude-opus-5-5' });
  });
});

describe('isLlmModel', () => {
  it('accepts listed models', () => {
    for (const m of LLM_MODELS) expect(isLlmModel(m.id)).toBe(true);
  });
  it('rejects others', () => {
    expect(isLlmModel('claude-opus-5-5-20260101')).toBe(false);
    expect(isLlmModel(undefined)).toBe(false);
    expect(isLlmModel(42)).toBe(false);
  });
});

const usage = (o: Partial<LLMUsage> = {}): LLMUsage => ({ model: 'claude-haiku-5-5', input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, ...o });

describe('costUsd', () => {
  it('prices input and output per million tokens', () => {
    expect(costUsd(usage({ input_tokens: 1_000_000, output_tokens: 1_000_000 }))).toBeCloseTo(0.6);
    expect(costUsd(usage({ model: 'claude-sonnet-5-5', input_tokens: 500_000, output_tokens: 100_000 }))).toBeCloseTo(2);
  });
  it('applies cache multipliers', () => {
    expect(costUsd(usage({ model: 'claude-opus-5-5', cache_creation_input_tokens: 1_000_000, cache_read_input_tokens: 1_000_000 }))).toBeCloseTo(4 * 1.25 + 4 * 0.1);
  });
  it('prices unknown models as Opus', () => {
    expect(costUsd(usage({ model: 'mystery', output_tokens: 1_000_000 }))).toBeCloseTo(20);
  });
});

describe('costUsd web search', () => {
  it('adds US$0.01 per web search', () => {
    expect(costUsd(usage({ web_search_requests: 10 }))).toBeCloseTo(0.1);
    expect(costUsd(usage({ input_tokens: 1_000_000, web_search_requests: 3 }))).toBeCloseTo(0.13);
  });
});

describe('withUsage', () => {
  it('passes usage to the sink and chains with an existing onUsage, through withModel', async () => {
    const u = usage({ input_tokens: 5 });
    const complete = vi.fn(async (req: { onUsage?: (u: LLMUsage) => void }) => { req.onUsage?.(u); return {}; });
    const sink = vi.fn();
    const existing = vi.fn();
    await withUsage(withModel({ complete } as LLMProvider, 'claude-haiku-5-5'), sink).complete({ ...base, onUsage: existing });
    expect(sink).toHaveBeenCalledWith(u);
    expect(existing).toHaveBeenCalledWith(u);
    expect(complete.mock.calls[0][0]).toMatchObject({ model: 'claude-haiku-5-5' });
  });
});
