'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { createLead, getSettings, updateSettings } from '@/lib/db';
import { claimCandidate, createDiscoveryStore, getCandidateLeadId, hasActiveRun, setCandidateLead, setRunCost } from '@/lib/db/discovery';
import { addContacts, listCompanyContacts, setLeadContact } from '@/lib/db/contacts';
import { ClaudeWebSearchProvider } from '@/lib/discovery/claude-search';
import { RssFeedProvider } from '@/lib/discovery/rss';
import { runDiscovery } from '@/lib/discovery/run';
import { getDefaultProvider } from '@/lib/llm/anthropic';
import { recordUsage } from '@/lib/db/usage';
import { withModel, withUsage, type LLMUsage } from '@/lib/llm/provider';
import { label } from '@/components/format';
import { recompute } from '../leads/actions';

const str = (fd: FormData, k: string): string | undefined => {
  const v = fd.get(k);
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
};

async function recordRun(runId: string, usages: LLMUsage[]) {
  try {
    const cost = await recordUsage('discovery', runId, usages);
    await setRunCost(runId, cost);
  } catch (e) {
    console.error('Failed to record discovery usage', e);
  }
  revalidatePath('/discovery');
}

/** Feeds only (daily). Feed and classification errors are recorded on the run rather than thrown. */
export async function runFeedsAction() {
  await requireUser();
  if (!process.env.ANTHROPIC_API_KEY) return;
  if (await hasActiveRun()) return;
  const settings = await getSettings();
  if (settings.discovery_feeds.length === 0) return;
  const usages: LLMUsage[] = [];
  const res = await runDiscovery({
    llm: withUsage(withModel(getDefaultProvider(), settings.llm_models.discovery), (u) => usages.push(u)),
    store: createDiscoveryStore(),
    queries: [],
    feeds: settings.discovery_feeds,
    feedProvider: new RssFeedProvider(),
    keywords: settings.discovery_keywords,
    feedMaxItems: settings.discovery_feed_max_items,
  });
  await recordRun(res.runId, usages);
}

/** Claude web search only (weekly). Each query is one paid web search. */
export async function runSearchAction() {
  await requireUser();
  if (!process.env.ANTHROPIC_API_KEY) return;
  if (await hasActiveRun()) return;
  const settings = await getSettings();
  const queries = settings.discovery_queries.slice(0, 15);
  if (queries.length === 0) return;
  const usages: LLMUsage[] = [];
  const collect = (u: LLMUsage) => { usages.push(u); };
  const res = await runDiscovery({
    llm: withUsage(withModel(getDefaultProvider(), settings.llm_models.discovery), collect),
    store: createDiscoveryStore(),
    queries,
    search: new ClaudeWebSearchProvider({ model: settings.llm_models.discovery, onUsage: collect }),
    feeds: [],
    keywords: settings.discovery_keywords,
  });
  await recordRun(res.runId, usages);
}

export async function acceptCandidate(formData: FormData) {
  await requireUser();
  const id = str(formData, 'candidate_id');
  if (!id) return;
  const c = await claimCandidate(id, ['pending', 'filtered', 'rejected'], 'accepted');
  if (!c) return;
  try {
    const signalType = c.signal_type ?? 'other';
    const people = c.people ?? [];
    const found = c.origin_type === 'rss' ? `RSS feed${c.query ? ` (${c.query})` : ''}` : `news search${c.query ? ` (query: "${c.query}")` : ''}`;
    let notes = `Found by ${found}. ${c.rationale ?? ''}`.trim();
    if (people.length && !c.company_name) {
      notes += ` People named: ${people.map((p) => (p.title ? `${p.name} (${p.title})` : p.name)).join(', ')}.`;
    }
    const lead = await createLead({
      title: `${c.company_name ?? c.headline}: ${label(signalType)}`.slice(0, 120),
      lead_type: c.signal_type === 'exec_appointment' ? 'executive' : 'corporate',
      source: 'news',
      notes,
      company: c.company_name ? { name: c.company_name, domain: c.company_domain ?? undefined, city: c.city ?? undefined, state: c.state ?? undefined } : undefined,
      est_headcount: c.est_headcount ?? undefined,
      signal: { signal_type: signalType, summary: c.summary, source_url: c.url, published_at: c.published_at ?? undefined },
    });
    // Link first so a failed rescore can't lead to a duplicate lead on retry.
    await setCandidateLead(id, lead.id);
    if (people.length && lead.company_id) {
      await addContacts(lead.company_id, people.map((p) => ({
        name: p.name,
        title: p.title,
        source_note: `Named in article (${p.role.replace('_', ' ')}): ${c.url}`,
      })));
      // Departing people are never the primary contact.
      const primary = people.find((p) => p.role === 'appointee' || p.role === 'new_partner') ?? people.find((p) => p.role === 'spokesperson');
      if (primary) {
        const match = (await listCompanyContacts(lead.company_id)).find((x) => x.name.toLowerCase() === primary.name.trim().toLowerCase());
        if (match) await setLeadContact(lead.id, match.id);
      }
    }
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

function parseFeeds(raw: string): { name: string; url: string }[] {
  const seen = new Set<string>();
  const out: { name: string; url: string }[] = [];
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    const bar = t.indexOf('|');
    const namePart = bar >= 0 ? t.slice(0, bar).trim() : '';
    const urlPart = (bar >= 0 ? t.slice(bar + 1) : t).trim();
    let u: URL;
    try { u = new URL(urlPart); } catch { continue; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
    if (seen.has(u.href)) continue;
    seen.add(u.href);
    out.push({ name: namePart || u.hostname.replace(/^www\./, ''), url: u.href });
  }
  return out.slice(0, 30);
}

export async function saveDiscoveryFeeds(formData: FormData) {
  await requireUser();
  await updateSettings({ discovery_feeds: parseFeeds(String(formData.get('feeds') ?? '')) });
  revalidatePath('/discovery');
}

export async function saveDiscoveryKeywords(formData: FormData) {
  await requireUser();
  const raw = String(formData.get('keywords') ?? '');
  const discovery_keywords = [...new Set(raw.split(/[\n,]/).map((s) => s.trim().toLowerCase()).filter(Boolean))].slice(0, 60);
  await updateSettings({ discovery_keywords });
  revalidatePath('/discovery');
}

export async function saveFeedMaxItems(formData: FormData) {
  await requireUser();
  const n = Number(String(formData.get('max_items') ?? '').trim());
  if (!Number.isInteger(n) || n < 1 || n > 50) return;
  await updateSettings({ discovery_feed_max_items: n });
  revalidatePath('/discovery');
}
