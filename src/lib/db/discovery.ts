import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { CandidateStatus, DiscoveryCandidate, DiscoveryRun } from '@/lib/types';
import type { DiscoveryStore, NewCandidate, RunResult } from '@/lib/discovery/run';

type Row = Record<string, unknown>;

function fail(context: string, error: { message: string }): never {
  throw new Error(`${context}: ${error.message}`);
}

function strip<T>(row: Row): T {
  const copy = { ...row };
  delete copy.owner_id;
  return copy as T;
}

export function createDiscoveryStore(): DiscoveryStore {
  return {
    async startRun(queries) {
      const db = await createClient();
      const { data, error } = await db.from('discovery_runs').insert({ queries, status: 'running' }).select('id').single();
      if (error) fail('startRun', error);
      return data.id as string;
    },
    async knownUrlKeys(keys) {
      const db = await createClient();
      const known = new Set<string>();
      for (let i = 0; i < keys.length; i += 50) {
        const { data, error } = await db.from('discovery_candidates').select('url_key').in('url_key', keys.slice(i, i + 50));
        if (error) fail('knownUrlKeys', error);
        for (const r of data ?? []) known.add(r.url_key as string);
      }
      return known;
    },
    async insertCandidates(rows: NewCandidate[]) {
      if (rows.length === 0) return;
      const db = await createClient();
      const { data: u, error: uErr } = await db.auth.getUser();
      if (uErr || !u.user) throw new Error('Not authenticated');
      const owner_id = u.user.id;
      const { error } = await db
        .from('discovery_candidates')
        .upsert(rows.map((r) => ({ ...r, owner_id })), { onConflict: 'owner_id,url_key', ignoreDuplicates: true });
      if (error) fail('insertCandidates', error);
    },
    async finishRun(id, result: RunResult) {
      const db = await createClient();
      const { error } = await db.from('discovery_runs').update({
        status: result.status,
        finished_at: new Date().toISOString(),
        results_found: result.results_found,
        candidates_created: result.candidates_created,
        search_requests: result.search_requests,
        llm_calls: result.llm_calls,
        errors: result.errors,
      }).eq('id', id);
      if (error) fail('finishRun', error);
    },
  };
}

/** True when a run started in the last 10 minutes is still marked running. */
export async function hasActiveRun(): Promise<boolean> {
  const db = await createClient();
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { count, error } = await db.from('discovery_runs').select('id', { count: 'exact', head: true }).eq('status', 'running').gte('started_at', since);
  if (error) fail('hasActiveRun', error);
  return (count ?? 0) > 0;
}

export async function latestRun(): Promise<DiscoveryRun | null> {
  const db = await createClient();
  const { data, error } = await db.from('discovery_runs').select('*').order('started_at', { ascending: false }).limit(1).maybeSingle();
  if (error) fail('latestRun', error);
  return data ? strip<DiscoveryRun>(data as Row) : null;
}

export async function listCandidates(status: CandidateStatus, limit = 100): Promise<DiscoveryCandidate[]> {
  const db = await createClient();
  let q = db.from('discovery_candidates').select('*').eq('status', status);
  q = status === 'pending'
    ? q.order('published_at', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false })
    : q.order('reviewed_at', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false });
  const { data, error } = await q.limit(limit);
  if (error) fail('listCandidates', error);
  return (data ?? []).map((r) => strip<DiscoveryCandidate>(r as Row));
}

export async function candidateCounts(): Promise<Record<CandidateStatus, number>> {
  const db = await createClient();
  const statuses: CandidateStatus[] = ['pending', 'accepted', 'rejected', 'filtered'];
  const counts = await Promise.all(statuses.map(async (s) => {
    const { count, error } = await db.from('discovery_candidates').select('id', { count: 'exact', head: true }).eq('status', s);
    if (error) fail('candidateCounts', error);
    return count ?? 0;
  }));
  return Object.fromEntries(statuses.map((s, i) => [s, counts[i]])) as Record<CandidateStatus, number>;
}

/** Conditional status change; returns null when the candidate is not in one of the `from` states. */
export async function claimCandidate(id: string, from: CandidateStatus[], to: CandidateStatus, extra: { reject_reason?: string | null } = {}): Promise<DiscoveryCandidate | null> {
  const db = await createClient();
  const { data, error } = await db.from('discovery_candidates').update({
    status: to,
    reviewed_at: to === 'pending' ? null : new Date().toISOString(),
    reject_reason: to === 'rejected' ? extra.reject_reason ?? null : null,
  }).eq('id', id).in('status', from).select('*').maybeSingle();
  if (error) fail('claimCandidate', error);
  return data ? strip<DiscoveryCandidate>(data as Row) : null;
}

export async function setCandidateLead(id: string, leadId: string): Promise<void> {
  const db = await createClient();
  const { error } = await db.from('discovery_candidates').update({ lead_id: leadId }).eq('id', id);
  if (error) fail('setCandidateLead', error);
}

export async function getCandidateLeadId(id: string): Promise<string | null> {
  const db = await createClient();
  const { data, error } = await db.from('discovery_candidates').select('lead_id').eq('id', id).maybeSingle();
  if (error) fail('getCandidateLeadId', error);
  return (data?.lead_id as string | null | undefined) ?? null;
}
