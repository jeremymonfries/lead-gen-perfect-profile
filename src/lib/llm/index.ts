import type { LeadWithRelations, Settings } from '@/lib/types';

export interface DraftRequest { lead: LeadWithRelations; channel: 'email' | 'linkedin'; settings: Settings; }
export interface DraftResult { subject: string | null; body: string; evidence_refs: string[]; }

export async function generateDraft(req: DraftRequest): Promise<DraftResult> { void req; throw new Error('not implemented'); }
