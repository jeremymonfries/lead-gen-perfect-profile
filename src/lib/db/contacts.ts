import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { Contact } from '@/lib/types';

type Row = Record<string, unknown>;
function fail(context: string, error: { message: string }): never {
  throw new Error(`${context}: ${error.message}`);
}
const strip = (r: Row) => { const c = { ...r }; delete c.owner_id; return c as unknown as Contact; };

export async function listCompanyContacts(companyId: string): Promise<Contact[]> {
  const db = await createClient();
  const { data, error } = await db.from('contacts').select('*').eq('company_id', companyId).order('created_at');
  if (error) fail('listCompanyContacts', error);
  return (data ?? []).map((r) => strip(r as Row));
}

/** Adds people as unverified contacts, skipping names already on file for the company (case-insensitive). */
export async function addContacts(companyId: string | null, people: { name: string; title?: string | null; source_note?: string | null }[]): Promise<Contact[]> {
  const clean = people.map((p) => ({ ...p, name: p.name.trim() })).filter((p) => p.name);
  if (!clean.length) return [];
  const existing = companyId ? await listCompanyContacts(companyId) : [];
  const seen = new Set(existing.map((c) => c.name.toLowerCase()));
  const rows = clean.filter((p) => !seen.has(p.name.toLowerCase()) && seen.add(p.name.toLowerCase()))
    .map((p) => ({ company_id: companyId, name: p.name, title: p.title?.trim() || null, source_note: p.source_note ?? null, verified: false }));
  if (!rows.length) return [];
  const db = await createClient();
  const { data, error } = await db.from('contacts').insert(rows).select('*');
  if (error) fail('addContacts', error);
  return (data ?? []).map((r) => strip(r as Row));
}

export async function setLeadContact(leadId: string, contactId: string): Promise<void> {
  const db = await createClient();
  const { error } = await db.from('leads').update({ contact_id: contactId }).eq('id', leadId);
  if (error) fail('setLeadContact', error);
}
