import { describe, it, expect, vi } from 'vitest';
import { buildClassifySystemPrompt, classifyBatch, CLASSIFY_JSON_SCHEMA, type ClassifyInput } from '../classify';
import type { LLMProvider } from '@/lib/llm/provider';

const inputs: ClassifyInput[] = [
  { index: 0, title: 'Acme opens new Melbourne office', description: 'Acme hires 40', publisher: 'afr.com', publishedAt: '2026-10-01T00:00:00.000Z', url: 'https://afr.com/a' },
  { index: 1, title: 'Economy slows', description: null, publisher: null, publishedAt: null, url: 'https://x.com/b' },
];
const item = (o: Record<string, unknown> = {}) => ({
  index: 0, relevant: true, signal_type: 'new_office', company_name: 'Acme', company_domain: 'https://www.Acme.com.au/about', city: 'Melbourne', state: 'VIC',
  location_match: 'melbourne', est_headcount: 40, summary: 'Acme opened an office.', rationale: 'New office.', ...o,
});
const prov = (...outs: unknown[]): LLMProvider & { complete: ReturnType<typeof vi.fn> } => {
  const complete = vi.fn();
  outs.forEach((o) => complete.mockResolvedValueOnce(o));
  return { complete };
};

describe('classifyBatch', () => {
  it('validates and cleans a good result', async () => {
    const p = prov({ items: [item(), item({ index: 1, relevant: false, signal_type: null, company_name: null, company_domain: null, city: null, state: null, location_match: 'unknown', est_headcount: null, summary: 'Economy', rationale: 'General news.' })] });
    const m = await classifyBatch(inputs, p);
    expect(m.get(0)).toMatchObject({ relevant: true, signal_type: 'new_office', company_domain: 'acme.com.au', est_headcount: 40 });
    expect(m.get(1)).toMatchObject({ relevant: false, signal_type: null });
    const req = p.complete.mock.calls[0][0];
    expect(req.maxTokens).toBe(300 * 2 + 500);
    expect(req.user).toContain('[0] Acme opens new Melbourne office | afr.com | 2026-10-01T00:00:00.000Z | https://afr.com/a');
    expect(req.user).toContain('Acme hires 40');
  });
  it('coerces missing signal_type, missing company, bad headcount, long summary', async () => {
    const m = await classifyBatch(inputs, prov({ items: [
      item({ signal_type: null, est_headcount: 2.5, summary: 'x'.repeat(500) }),
      item({ index: 1, company_name: '  ', rationale: 'Vague.' }),
    ] }));
    expect(m.get(0)).toMatchObject({ signal_type: 'other', est_headcount: null });
    expect(m.get(0)!.summary).toHaveLength(400);
    expect(m.get(1)).toMatchObject({ relevant: false, rationale: 'No organisation named. Vague.' });
    const z = await classifyBatch(inputs, prov({ items: [item({ est_headcount: 0 })] }));
    expect(z.get(0)!.est_headcount).toBeNull();
  });
  it('ignores unknown indexes and dedupes by index (first wins)', async () => {
    const m = await classifyBatch(inputs, prov({ items: [item({ summary: 'first' }), item({ summary: 'second' }), item({ index: 99 })] }));
    expect([...m.keys()]).toEqual([0]);
    expect(m.get(0)!.summary).toBe('first');
  });
  it('drops invalid entries but keeps valid ones', async () => {
    const m = await classifyBatch(inputs, prov({ items: [{ index: 0, relevant: 'yes' }, item({ index: 1 })] }));
    expect([...m.keys()]).toEqual([1]);
  });
  it('retries once on invalid output then succeeds', async () => {
    const p = prov('nope', { items: [item()] });
    const m = await classifyBatch(inputs, p);
    expect(m.size).toBe(1);
    expect(p.complete).toHaveBeenCalledTimes(2);
  });
  it('throws after the retry fails', async () => {
    const p = prov('nope', { bad: true });
    await expect(classifyBatch(inputs, p)).rejects.toThrow();
    expect(p.complete).toHaveBeenCalledTimes(2);
  });
});

describe('prompt and schema', () => {
  it('states the evidence-only rule', () => {
    const s = buildClassifySystemPrompt();
    expect(s).toContain('EVIDENCE ONLY');
    expect(s).toContain('Perfect Profile');
    expect(s).toContain('melbourne');
  });
  it('is strict: all properties required, no additional properties', () => {
    const it = CLASSIFY_JSON_SCHEMA.properties.items.items;
    expect(CLASSIFY_JSON_SCHEMA.additionalProperties).toBe(false);
    expect(it.additionalProperties).toBe(false);
    expect([...it.required].sort()).toEqual(Object.keys(it.properties).sort());
    expect(it.properties.signal_type.anyOf[0]).toMatchObject({ enum: expect.arrayContaining(['tender', 'other']) });
  });
});
