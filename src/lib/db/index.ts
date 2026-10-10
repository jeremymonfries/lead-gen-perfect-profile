import 'server-only';
import type {
  Activity, ActivityType, Company, CommercialState, Lead, LeadSource, LeadStatus, LeadType,
  LeadWithRelations, OutreachDraft, Settings, SignalType,
} from '@/lib/types';

const ni = (): never => { throw new Error('not implemented'); };

export async function listLeads(filters?: { status?: LeadStatus; source?: LeadSource; commercial_state?: CommercialState; lead_type?: LeadType; min_score?: number; q?: string }): Promise<(Lead & { company: Company | null })[]> { void filters; return ni(); }
export async function getLead(id: string): Promise<LeadWithRelations | null> { void id; return ni(); }
export async function createLead(input: { title: string; lead_type: LeadType; source: LeadSource; notes?: string; company?: { name: string; domain?: string; city?: string; state?: string }; contact?: { name: string; title?: string; email?: string; linkedin_url?: string }; est_headcount?: number; est_locations?: number; signal?: { signal_type: SignalType; summary: string; source_url?: string; published_at?: string } }): Promise<Lead> { void input; return ni(); }
export async function updateLead(id: string, patch: Partial<Omit<Lead, 'id' | 'owner_id' | 'created_at' | 'updated_at'>>): Promise<Lead> { void id; void patch; return ni(); }
export async function listActivities(leadId: string): Promise<Activity[]> { void leadId; return ni(); }
export async function logActivity(leadId: string, type: ActivityType, detail?: string, metadata?: Record<string, unknown>): Promise<Activity> { void leadId; void type; void detail; void metadata; return ni(); }
export async function getSettings(): Promise<Settings> { return ni(); }
export async function updateSettings(patch: Partial<Settings>): Promise<Settings> { void patch; return ni(); }
export async function saveDraft(input: Omit<OutreachDraft, 'id' | 'created_by' | 'created_at' | 'copied_at'>): Promise<OutreachDraft> { void input; return ni(); }
export async function listDrafts(leadId: string): Promise<OutreachDraft[]> { void leadId; return ni(); }
export async function markDraftCopied(id: string): Promise<void> { void id; return ni(); }
