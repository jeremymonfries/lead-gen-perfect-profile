'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { createLead, getSettings, updateSettings } from '@/lib/db';
import { claimCandidate, createDiscoveryStore, getCandidateLeadId, hasActiveRun, setCandidateLead } from '@/lib/db/discovery';
import { BraveNewsProvider } from '@/lib/discovery/news';
import { runDiscovery } from '@/lib/discovery/run';
import { getDefaultProvider } from '@/lib/llm/anthropic';
import { label } from '@/components/format';
import { recompute } from '../leads/actions';

const str = (fd: FormData, k: string): string | undefined => {
  const v = fd.get(k);
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
};

export async function runDiscoveryAction() {
  await requireUser();
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key || !process.env.ANTHROPIC_API_KEY) return;
  if (await hasActiveRun()) return;
  const { discovery_queries: queries } = await getSettings();
  if (!queries.some((q) => q.trim())) return;
  // Search and classification errors are recorded on the run rather than thrown.
  await runDiscovery({ search: new BraveNewsProvider(key), llm: getDefaultProvider(), store: createDiscoveryStore(), queries });
  revalidatePath('/discovery');
}

export async function acceptCandidate(formData: FormData) {
  await requireUser();
  const id = str(formData, 'candidate_id');
  if (!id) return;
  const c = await claimCandidate(id, ['pending', 'filtered', 'rejected'], 'accepted');
  if (!c) return;
  try {
    const signalType = c.signal_type ?? 'other';
    const lead = await createLead({
      title: `${c.company_name ?? c.headline}: ${label(signalType)}`.slice(0, 120),
      lead_type: c.signal_type === 'exec_appointment' ? 'executive' : 'corporate',
      source: 'news',
      notes: `Found by news search${c.query ? ` (query: "${c.query}")` : ''}. ${c.rationale ?? ''}`.trim(),
      company: c.company_name ? { name: c.company_name, domain: c.company_domain ?? undefined, city: c.city ?? undefined, state: c.state ?? undefined } : undefined,
      est_headcount: c.est_headcount ?? undefined,
      signal: { signal_type: signalType, summary: c.summary, source_url: c.url, published_at: c.published_at ?? undefined },
    });
    // Link first so a failed rescore can't lead to a duplicate lead on retry.
    await setCandidateLead(id, lead.id);
    await recompute(lead.id);
  } catch (e) {
    if (!(await getCandidateLeadId(id))) await claimCandidate(id, ['accepted'], 'pending');
    throw e;
  }
  revalidatePath('/discovery');
  revalidatePath('/leads');
}

export async function rejectCandidate(formData: FormData) {
  await requireUser();
  const id = str(formData, 'candidate_id');
  if (!id) return;
  await claimCandidate(id, ['pending'], 'rejected', { reject_reason: str(formData, 'reason') ?? null });
  revalidatePath('/discovery');
}

export async function restoreCandidate(formData: FormData) {
  await requireUser();
  const id = str(formData, 'candidate_id');
  if (!id) return;
  await claimCandidate(id, ['rejected', 'filtered'], 'pending');
  revalidatePath('/discovery');
}

export async function saveDiscoveryQueries(formData: FormData) {
  await requireUser();
  const raw = String(formData.get('queries') ?? '');
  const discovery_queries = [...new Set(raw.split('\n').map((s) => s.trim()).filter(Boolean))].slice(0, 20);
  await updateSettings({ discovery_queries });
  revalidatePath('/discovery');
}
