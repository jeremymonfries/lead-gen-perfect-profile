'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { getLead, getSettings, logActivity } from '@/lib/db';
import { addContacts, listCompanyContacts, setLeadContact } from '@/lib/db/contacts';
import { buyerRoles } from '@/lib/discovery/buyer-roles';
import { findPeopleOnWebsite } from '@/lib/discovery/website';
import { getDefaultProvider } from '@/lib/llm/anthropic';
import { withModel } from '@/lib/llm/provider';
import { createClient } from '@/lib/supabase/server';

const str = (fd: FormData, k: string): string | undefined => {
  const v = fd.get(k);
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t === '' ? undefined : t;
};

export async function findPeopleAction(formData: FormData): Promise<void> {
  await requireUser();
  const id = str(formData, 'lead_id');
  if (!id) return;
  const lead = await getLead(id);
  const company = lead?.company;
  if (!lead || !company?.domain) return;
  if (!process.env.ANTHROPIC_API_KEY) return;

  const settings = await getSettings();
  const latest = [...lead.signals].sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? ''))[0];
  const result = await findPeopleOnWebsite(company.domain, {
    llm: withModel(getDefaultProvider(), settings.llm_models.discovery),
    preferredRoles: buyerRoles(latest?.signal_type ?? null, { leadType: lead.lead_type, companyName: company.name }),
  });
  const added = await addContacts(
    company.id,
    result.people.map((p) => ({ name: p.name, title: p.title, source_note: `Company website: ${p.page_url}` })),
  );
  const errs = result.errors.length ? ` Issues: ${result.errors.slice(0, 3).join('; ')}` : '';
  await logActivity(id, 'note', `Website lookup: found ${result.people.length} people (${added.length} new) on ${company.domain}.${errs}`);
  revalidatePath(`/leads/${id}`);
}

export async function setPrimaryContactAction(formData: FormData): Promise<void> {
  await requireUser();
  const id = str(formData, 'lead_id');
  const contactId = str(formData, 'contact_id');
  if (!id || !contactId) return;
  const lead = await getLead(id);
  if (!lead?.company) return;
  const contacts = await listCompanyContacts(lead.company.id);
  const contact = contacts.find((c) => c.id === contactId);
  if (!contact) return;
  await setLeadContact(id, contact.id);
  await logActivity(id, 'updated', `Primary contact set to ${contact.name}`);
  revalidatePath(`/leads/${id}`);
}

export async function addPersonAction(formData: FormData): Promise<void> {
  await requireUser();
  const id = str(formData, 'lead_id');
  const name = str(formData, 'name');
  if (!id || !name) return;
  const title = str(formData, 'title') ?? null;
  let linkedin = str(formData, 'linkedin_url');
  if (linkedin) {
    if (!/^https?:\/\//i.test(linkedin)) linkedin = `https://${linkedin}`;
    try {
      const host = new URL(linkedin).hostname.toLowerCase();
      if (host !== 'linkedin.com' && !host.endsWith('.linkedin.com')) linkedin = undefined;
    } catch { linkedin = undefined; }
  }
  const lead = await getLead(id);
  if (!lead?.company) return;

  await addContacts(lead.company.id, [{ name, title, source_note: 'Added manually' }]);
  const person = (await listCompanyContacts(lead.company.id)).find((c) => c.name.toLowerCase() === name.toLowerCase());
  if (person && linkedin) {
    const db = await createClient();
    const { error } = await db.from('contacts').update({ linkedin_url: linkedin }).eq('id', person.id);
    if (error) throw new Error(`addPerson linkedin: ${error.message}`);
  }
  if (person && !lead.contact_id) await setLeadContact(id, person.id);
  await logActivity(id, 'updated', `Added person: ${name}${title ? ` (${title})` : ''}`);
  revalidatePath(`/leads/${id}`);
}
