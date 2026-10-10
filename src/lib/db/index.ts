import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { DEFAULT_SETTINGS } from '@/lib/settings-defaults';
import type {
  Activity, ActivityType, Company, CommercialState, Contact, Lead, LeadSource, LeadStatus, LeadType,
  LeadWithRelations, OutreachDraft, Settings, Signal, SignalType,
} from '@/lib/types';

type Db = Awaited<ReturnType<typeof createClient>>;
type Row = Record<string, unknown>;

function fail(context: string, error: { message: string }): never {
  throw new Error(`${context}: ${error.message}`);
}

async function currentUserId(db: Db): Promise<string> {
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) throw new Error(`Not authenticated${error ? `: ${error.message}` : ''}`);
  return data.user.id;
}

/** Remove DB-only columns (owner_id) from child rows. */
function strip<T>(row: Row, keys: string[] = ['owner_id']): T {
  const copy = { ...row };
  for (const k of keys) delete copy[k];
  return copy as T;
}

/** Escape LIKE wildcards so user text matches literally. */
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

const LEAD_WITH_COMPANY = '*, company:companies(id,name,domain,industry,employee_range,city,state,abn,office_count,created_at,updated_at)';

export type LeadListItem = Lead & { company: Company | null; latest_signal: Pick<Signal, 'signal_type' | 'published_at'> | null };

export async function listLeads(filters?: { status?: LeadStatus; source?: LeadSource; commercial_state?: CommercialState; lead_type?: LeadType; min_score?: number; q?: string }): Promise<LeadListItem[]> {
  const db = await createClient();
  const q = filters?.q?.trim();
  let query = db.from('leads').select(`${LEAD_WITH_COMPANY}, lead_signals(signal:signals(signal_type,published_at,discovered_at))`);
  if (filters?.status) query = query.eq('status', filters.status);
  if (filters?.source) query = query.eq('source', filters.source);
  if (filters?.commercial_state) query = query.eq('commercial_state', filters.commercial_state);
  if (filters?.lead_type) query = query.eq('lead_type', filters.lead_type);
  if (filters?.min_score != null) query = query.gte('score', filters.min_score);
  if (q) {
    // Match lead title OR company name. Company name is matched via a separate id lookup
    // so leads without a company still match on title.
    const pattern = `%${likeEscape(q)}%`;
    const { data: cos, error: cErr } = await db.from('companies').select('id').ilike('name', pattern);
    if (cErr) fail('listLeads (company search)', cErr);
    const ids = (cos ?? []).map((c) => c.id as string);
    const titleFilter = `title.ilike."${pattern.replace(/"/g, '\\"')}"`;
    query = query.or(ids.length ? `${titleFilter},company_id.in.(${ids.join(',')})` : titleFilter);
  }
  const { data, error } = await query
    .order('score', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (error) fail('listLeads', error);
  type SigRow = Pick<Signal, 'signal_type' | 'published_at' | 'discovered_at'>;
  return ((data ?? []) as unknown as (Row & { lead_signals: { signal: SigRow | null }[] | null })[]).map(({ lead_signals, ...lead }) => {
    // Most recent by published_at, falling back to discovered_at.
    const when = (x: SigRow) => x.published_at ?? x.discovered_at ?? '';
    const latest = (lead_signals ?? []).map((ls) => ls.signal).filter((x): x is SigRow => !!x).sort((a, b) => when(b).localeCompare(when(a)))[0];
    return {
      ...(lead as unknown as Lead & { company: Company | null }),
      latest_signal: latest ? { signal_type: latest.signal_type, published_at: latest.published_at } : null,
    };
  });
}

export async function getLead(id: string): Promise<LeadWithRelations | null> {
  const db = await createClient();
  const { data, error } = await db
    .from('leads')
    .select(`*, company:companies(*), contact:contacts(*), lead_signals(contribution, signal:signals(*))`)
    .eq('id', id)
    .maybeSingle();
  if (error) fail('getLead', error);
  if (!data) return null;
  const { lead_signals, company, contact, ...lead } = data as unknown as Row & {
    lead_signals: { contribution: number | null; signal: Row | null }[] | null;
    company: Row | null;
    contact: Row | null;
  };
  const signals = (lead_signals ?? [])
    .filter((ls) => ls.signal)
    .map((ls) => ({ ...strip<Signal>(ls.signal as Row), contribution: ls.contribution }));
  return {
    ...(lead as unknown as Lead),
    company: company ? strip<Company>(company) : null,
    contact: contact ? strip<Contact>(contact) : null,
    signals,
  };
}

export async function createLead(input: { title: string; lead_type: LeadType; source: LeadSource; notes?: string; company?: { name: string; domain?: string; city?: string; state?: string }; contact?: { name: string; title?: string; email?: string; linkedin_url?: string }; est_headcount?: number; est_locations?: number; signal?: { signal_type: SignalType; summary: string; source_url?: string; published_at?: string } }): Promise<Lead> {
  const db = await createClient();
  let companyId: string | null = null;
  if (input.company?.name?.trim()) {
    const name = input.company.name.trim();
    const domain = input.company.domain?.trim().toLowerCase() || null;
    let existing: string | null = null;
    if (domain) {
      const { data, error } = await db.from('companies').select('id').ilike('domain', likeEscape(domain)).limit(1);
      if (error) fail('createLead (find company by domain)', error);
      existing = (data?.[0]?.id as string | undefined) ?? null;
    }
    if (!existing) {
      const { data, error } = await db.from('companies').select('id').ilike('name', likeEscape(name)).limit(1);
      if (error) fail('createLead (find company by name)', error);
      existing = (data?.[0]?.id as string | undefined) ?? null;
    }
    if (existing) {
      companyId = existing;
      const patch: Row = {};
      if (input.company.city) patch.city = input.company.city;
      if (input.company.state) patch.state = input.company.state;
      if (domain) patch.domain = domain;
      if (Object.keys(patch).length) {
        const { error } = await db.from('companies').update(patch).eq('id', existing);
        if (error) fail('createLead (update company)', error);
      }
    } else {
      const { data, error } = await db
        .from('companies')
        .insert({ name, domain, city: input.company.city ?? null, state: input.company.state ?? null })
        .select('id')
        .single();
      if (error) fail('createLead (insert company)', error);
      companyId = data.id as string;
    }
  }

  let contactId: string | null = null;
  if (input.contact?.name?.trim()) {
    const { data, error } = await db
      .from('contacts')
      .insert({
        company_id: companyId,
        name: input.contact.name.trim(),
        title: input.contact.title ?? null,
        email: input.contact.email ?? null,
        linkedin_url: input.contact.linkedin_url ?? null,
      })
      .select('id')
      .single();
    if (error) fail('createLead (insert contact)', error);
    contactId = data.id as string;
  }

  const { data: leadRow, error: leadErr } = await db
    .from('leads')
    .insert({
      company_id: companyId,
      contact_id: contactId,
      lead_type: input.lead_type,
      source: input.source,
      title: input.title,
      notes: input.notes ?? null,
      est_headcount: input.est_headcount ?? null,
      est_locations: input.est_locations ?? null,
      commercial_state: 'needs_research',
    })
    .select('*')
    .single();
  if (leadErr) fail('createLead (insert lead)', leadErr);
  const lead = leadRow as unknown as Lead;

  if (input.signal) {
    const { data: sig, error: sErr } = await db
      .from('signals')
      .insert({
        company_id: companyId,
        signal_type: input.signal.signal_type,
        summary: input.signal.summary,
        source_url: input.signal.source_url ?? null,
        published_at: input.signal.published_at ?? null,
        date_confidence: input.signal.published_at ? 'exact' : 'unknown',
      })
      .select('id')
      .single();
    if (sErr) fail('createLead (insert signal)', sErr);
    const { error: lsErr } = await db.from('lead_signals').insert({ lead_id: lead.id, signal_id: sig.id });
    if (lsErr) fail('createLead (link signal)', lsErr);
  }

  await logActivity(lead.id, 'created', `Lead created from ${input.source}`, { source: input.source });
  return lead;
}

export async function updateLead(id: string, patch: Partial<Omit<Lead, 'id' | 'owner_id' | 'created_at' | 'updated_at'>>): Promise<Lead> {
  const db = await createClient();
  let previousStatus: LeadStatus | null = null;
  if (patch.status !== undefined) {
    const { data, error } = await db.from('leads').select('status').eq('id', id).maybeSingle();
    if (error) fail('updateLead (read status)', error);
    if (!data) throw new Error(`updateLead: lead ${id} not found`);
    previousStatus = data.status as LeadStatus;
  }
  const { data, error } = await db.from('leads').update(patch).eq('id', id).select('*').maybeSingle();
  if (error) fail('updateLead', error);
  if (!data) throw new Error(`updateLead: lead ${id} not found`);
  if (patch.status !== undefined && previousStatus !== patch.status) {
    await logActivity(id, 'status_changed', `Status changed from ${previousStatus} to ${patch.status}`, { from: previousStatus, to: patch.status });
  }
  return data as unknown as Lead;
}

export async function listActivities(leadId: string): Promise<Activity[]> {
  const db = await createClient();
  const { data, error } = await db
    .from('activities')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false });
  if (error) fail('listActivities', error);
  return (data ?? []).map((r) => strip<Activity>(r as Row));
}

export async function logActivity(leadId: string, type: ActivityType, detail?: string, metadata?: Record<string, unknown>): Promise<Activity> {
  const db = await createClient();
  const userId = await currentUserId(db);
  const { data, error } = await db
    .from('activities')
    .insert({ lead_id: leadId, user_id: userId, activity_type: type, detail: detail ?? null, metadata: metadata ?? null })
    .select('*')
    .single();
  if (error) fail('logActivity', error);
  return strip<Activity>(data as Row);
}

function mergeSettings(stored: Partial<Settings> | null | undefined): Settings {
  const s = stored ?? {};
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    score_bands: { ...DEFAULT_SETTINGS.score_bands, ...(s.score_bands ?? {}) },
    freshness_days: { ...DEFAULT_SETTINGS.freshness_days, ...(s.freshness_days ?? {}) },
  };
}

export async function getSettings(): Promise<Settings> {
  const db = await createClient();
  const { data, error } = await db.from('settings').select('data').maybeSingle();
  if (error) fail('getSettings', error);
  return mergeSettings(data?.data as Partial<Settings> | undefined);
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const db = await createClient();
  const userId = await currentUserId(db);
  const current = await getSettings();
  const next = mergeSettings({
    ...current,
    ...patch,
    score_bands: { ...current.score_bands, ...(patch.score_bands ?? {}) },
    freshness_days: { ...current.freshness_days, ...(patch.freshness_days ?? {}) },
  });
  const { error } = await db.from('settings').upsert({ owner_id: userId, data: next }, { onConflict: 'owner_id' });
  if (error) fail('updateSettings', error);
  return next;
}

export async function saveDraft(input: Omit<OutreachDraft, 'id' | 'created_by' | 'created_at' | 'copied_at'>): Promise<OutreachDraft> {
  const db = await createClient();
  const { data, error } = await db
    .from('outreach_drafts')
    .insert({
      lead_id: input.lead_id,
      channel: input.channel,
      subject: input.subject ?? null,
      body: input.body,
      evidence_refs: input.evidence_refs ?? [],
    })
    .select('*')
    .single();
  if (error) fail('saveDraft', error);
  return strip<OutreachDraft>(data as Row);
}

export async function listDrafts(leadId: string): Promise<OutreachDraft[]> {
  const db = await createClient();
  const { data, error } = await db
    .from('outreach_drafts')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false });
  if (error) fail('listDrafts', error);
  return (data ?? []).map((r) => strip<OutreachDraft>(r as Row));
}

export async function markDraftCopied(id: string): Promise<void> {
  const db = await createClient();
  const { error } = await db.from('outreach_drafts').update({ copied_at: new Date().toISOString() }).eq('id', id);
  if (error) fail('markDraftCopied', error);
}
