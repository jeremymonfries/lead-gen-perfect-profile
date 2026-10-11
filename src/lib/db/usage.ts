import 'server-only';
import { costUsd } from '@/lib/llm/models';
import type { LLMUsage } from '@/lib/llm/provider';
import { createClient } from '@/lib/supabase/server';

export type UsageJob = 'discovery' | 'website' | 'draft';

/** Records token usage and computed cost for a set of Claude calls. Returns the total cost (US$). */
export async function recordUsage(job: UsageJob, refId: string | null, usages: LLMUsage[]): Promise<number> {
  if (usages.length === 0) return 0;
  const rows = usages.map((u) => ({
    job, ref_id: refId, model: u.model,
    input_tokens: u.input_tokens, output_tokens: u.output_tokens,
    cache_read_input_tokens: u.cache_read_input_tokens, cache_creation_input_tokens: u.cache_creation_input_tokens,
    cost_usd: costUsd(u),
  }));
  const db = await createClient();
  const { error } = await db.from('llm_usage').insert(rows);
  if (error) throw new Error(`recordUsage: ${error.message}`);
  return rows.reduce((t, r) => t + r.cost_usd, 0);
}

export interface UsageSummary { total: number; byJob: Record<UsageJob, number>; calls: number }

export async function usageSummary(sinceIso: string): Promise<UsageSummary> {
  const db = await createClient();
  const { data, error } = await db.from('llm_usage').select('job,cost_usd').gte('created_at', sinceIso).limit(10000);
  if (error) throw new Error(`usageSummary: ${error.message}`);
  const out: UsageSummary = { total: 0, byJob: { discovery: 0, website: 0, draft: 0 }, calls: 0 };
  for (const r of data ?? []) {
    const c = Number(r.cost_usd) || 0;
    out.total += c;
    out.byJob[r.job as UsageJob] += c;
    out.calls++;
  }
  return out;
}

export const monthStartIso = (now = new Date()) => new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

export const fmtUsd = (n: number) => `US$${n.toFixed(n < 0.01 ? 4 : 2)}`;
