import { describe, expect, it, vi } from 'vitest';
import { isLlmModel, LLM_MODELS } from '../models';
import { withModel, type LLMProvider } from '../provider';

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
