'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { getLead, getSettings, createLead as dbCreateLead, updateLead, logActivity } from '@/lib/db';
import { estimateValue, commercialGate, scoreLead } from '@/lib/scoring';
import type { LeadSource, LeadStatus, LeadType, SignalType } from '@/lib/types';

const str = (fd: FormData, k: string): string | undefined => {
  const v = fd.get(k);
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t === '' ? undefined : t;
};
const num = (fd: FormData, k: string): number | undefined => {
  const s = str(fd, k);
  if (s === undefined) return undefined;
  const n = Number(s.replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : undefined;
};

/** Recompute value estimate (unless manual override), commercial state and score. */
export async function recompute(leadId: string, opts: { manualValue?: boolean } = {}) {
  await requireUser();
  const [lead, settings] = await Promise.all([getLead(leadId), getSettings()]);
  if (!lead) throw new Error('Lead not found');
  let { est_value_low: low, est_value_high: high, assumptions } = lead;
  if (!opts.manualValue) {
    const est = estimateValue(lead, settings);
    low = est.low; high = est.high; assumptions = est.assumptions;
  } else {
    assumptions = 'Manual value override entered by user.';
  }
  const merged = { ...lead, est_value_low: low, est_value_high: high, assumptions };
  const commercial_state = commercialGate(merged, settings);
  const breakdown = scoreLead({ ...merged, commercial_state }, lead.signals, settings);
  await updateLead(leadId, { est_value_low: low, est_value_high: high, assumptions, commercial_state, score: breakdown.total, score_breakdown: breakdown });
}

export async function createLeadAction(formData: FormData) {
  await requireUser();
  const title = str(formData, 'title');
  if (!title) throw new Error('Title is required');
  const companyName = str(formData, 'company_name');
  const contactName = str(formData, 'contact_name');
  const sigSummary = str(formData, 'signal_summary');
  const lead = await dbCreateLead({
    title,
    lead_type: (str(formData, 'lead_type') ?? 'corporate') as LeadType,
    source: (str(formData, 'source') ?? 'linkedin') as LeadSource,
    notes: str(formData, 'notes'),
    company: companyName ? { name: companyName, domain: str(formData, 'company_domain'), city: str(formData, 'company_city'), state: str(formData, 'company_state') } : undefined,
    contact: contactName ? { name: contactName, title: str(formData, 'contact_title'), email: str(formData, 'contact_email'), linkedin_url: str(formData, 'contact_linkedin_url') } : undefined,
    est_headcount: num(formData, 'est_headcount'),
    est_locations: num(formData, 'est_locations'),
    signal: sigSummary ? { signal_type: (str(formData, 'signal_type') ?? 'other') as SignalType, summary: sigSummary, source_url: str(formData, 'signal_url'), published_at: str(formData, 'signal_date') } : undefined,
  });
  await recompute(lead.id);
  revalidatePath('/leads');
  redirect(`/leads/${lead.id}`);
}

export async function changeStatus(formData: FormData) {
  await requireUser();
  const id = str(formData, 'lead_id')!;
  const status = str(formData, 'status') as LeadStatus;
  const lead = await getLead(id);
  if (!lead || lead.status === status) return;
  await updateLead(id, { status });
  await logActivity(id, 'status_changed', `${lead.status} → ${status}`, { from: lead.status, to: status });
  revalidatePath(`/leads/${id}`); revalidatePath('/leads');
}

export async function saveEstimates(formData: FormData) {
  await requireUser();
  const id = str(formData, 'lead_id')!;
  const low = num(formData, 'value_low');
  const high = num(formData, 'value_high');
  const manual = low !== undefined || high !== undefined;
  await updateLead(id, {
    est_headcount: num(formData, 'est_headcount') ?? null,
    est_locations: num(formData, 'est_locations') ?? null,
    exception_reason: str(formData, 'exception_reason') ?? null,
    recommended_service: str(formData, 'recommended_service') ?? null,
    next_action: str(formData, 'next_action') ?? null,
    ...(manual ? { est_value_low: low ?? high ?? null, est_value_high: high ?? low ?? null } : {}),
  });
  await recompute(id, { manualValue: manual });
  await logActivity(id, 'updated', manual ? 'Estimates updated (manual value override)' : 'Estimates updated');
  revalidatePath(`/leads/${id}`); revalidatePath('/leads');
}

export async function addNote(formData: FormData) {
  await requireUser();
  const id = str(formData, 'lead_id')!;
  const note = str(formData, 'note');
  if (!note) return;
  await logActivity(id, 'note', note);
  revalidatePath(`/leads/${id}`);
}

export async function recordOutcome(formData: FormData) {
  await requireUser();
  const id = str(formData, 'lead_id')!;
  const outcome = str(formData, 'outcome');
  if (outcome === 'won') {
    const revenue = num(formData, 'actual_revenue');
    if (revenue === undefined) throw new Error('Actual revenue is required for a won lead');
    await updateLead(id, { status: 'won', actual_revenue: revenue });
    await logActivity(id, 'won', `Won — actual revenue A$${revenue}`, { actual_revenue: revenue });
  } else if (outcome === 'lost') {
    const reason = str(formData, 'reason');
    await updateLead(id, { status: 'lost' });
    await logActivity(id, 'lost', reason ?? 'Lost (no reason given)', { reason: reason ?? null });
  }
  revalidatePath(`/leads/${id}`); revalidatePath('/leads');
}
