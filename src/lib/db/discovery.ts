import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { CandidatePerson, CandidateStatus, DiscoveryCandidate, DiscoveryRun } from '@/lib/types';
import { newPeople } from '@/lib/discovery/dedupe';
import type { DiscoveryStore, NewCandidate, RunResult } from '@/lib/discovery/run';

type Row = Record<string, unknown>;

function fail(context: string, error: { message: string }): never {
  throw new Error(`${context}: ${error.message}`);
}

function toCandidate(row: Row): DiscoveryCandidate {
  const c = strip<DiscoveryCandidate>(row);
  return { ...c, people: Array.isArray(c.people) ? c.people : [] };
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
      if (rows.length === 0) return [];
      const db = await createClient();
      const { data: u, error: uErr } = await db.auth.getUser();
      if (uErr || !u.user) throw new Error('Not authenticated');
      const owner_id = u.user.id;
      const { data, error } = await db
        .from('discovery_candidates')
        .upsert(rows.map((r) => ({ ...r, owner_id })), { onConflict: 'owner_id,url_key', ignoreDuplicates: true })
        .select('id,url_key');
      if (error) fail('insertCandidates', error);
      return (data ?? []).map((r) => ({ id: r.id as string, url_key: r.url_key as string }));
    },
    async recentCandidates(sinceDays) {
      const db = await createClient();
      const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString();
      const { data, error } = await db
        .from('discovery_candidates')
        .select('id,company_name,signal_type,people,published_at,status,query,headline')
        .in('status', ['pending', 'accepted'])
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) fail('recentCandidates', error);
      return (data ?? []).map((r) => ({ ...(r as Row), people: Array.isArray(r.people) ? r.people : [] })) as Awaited<ReturnType<DiscoveryStore['recentCandidates']>>;
    },
    async mergePeople(id, people) {
      if (people.length === 0) return;
      const db = await createClient();
      const { data, error } = await db.from('discovery_candidates').select('people').eq('id', id).maybeSingle();
      if (error) fail('mergePeople', error);
      if (!data) return;
      const current: CandidatePerson[] = Array.isArray(data.people) ? data.people : [];
      const merged = [...current, ...newPeople(current, people)];
      if (merged.length === current.length) return;
      const { error: uErr } = await db.from('discovery_candidates').update({ people: merged }).eq('id', id);
      if (uErr) fail('mergePeople', uErr);
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
        feeds_checked: result.feeds_checked,
        feed_items: result.feed_items,
        prefiltered_out: result.prefiltered_out,
        capped_out: result.capped_out,
        duplicates_merged: result.duplicates_merged,
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

/** Most recent run that used news search (its queries include non-feed entries). */
export async function lastSearchRun(): Promise<DiscoveryRun | null> {
  const db = await createClient();
  const { data, error } = await db.from('discovery_runs').select('*').order('started_at', { ascending: false }).limit(50);
  if (error) fail('lastSearchRun', error);
  const row = (data ?? []).find((r) => Array.isArray(r.queries) && r.queries.some((q: string) => !q.startsWith('feed: ')));
  return row ? strip<DiscoveryRun>(row as Row) : null;
}

const LOC_PRIORITY: Record<string, number> = { melbourne: 0, australia_other: 1, unknown: 2, outside_australia: 3 };

export async function listCandidates(status: CandidateStatus, limit = 100): Promise<DiscoveryCandidate[]> {
  const db = await createClient();
  let q = db.from('discovery_candidates').select('*').eq('status', status);
  q = status === 'pending'
    ? q.order('published_at', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false })
    : q.order('reviewed_at', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false });
  const { data, error } = await q.limit(status === 'pending' ? 300 : limit);
  if (error) fail('listCandidates', error);
  const list = (data ?? []).map((r) => toCandidate(r as Row));
  if (status !== 'pending') return list;
  // Melbourne first, then rest of Australia, then unknown, then outside Australia; newest within each group.
  const t = (v: string | null) => (v ? Date.parse(v) || 0 : 0);
  return list
    .sort((a, b) =>
      (LOC_PRIORITY[a.location_match] ?? 2) - (LOC_PRIORITY[b.location_match] ?? 2) ||
      t(b.published_at) - t(a.published_at) ||
      t(b.created_at) - t(a.created_at))
    .slice(0, limit);
}

export async function setRunCost(runId: string, cost: number): Promise<void> {
  const db = await createClient();
  const { error } = await db.from('discovery_runs').update({ cost_usd: cost }).eq('id', runId);
  if (error) fail('setRunCost', error);
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
  return data ? toCandidate(data as Row) : null;
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
