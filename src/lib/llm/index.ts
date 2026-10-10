import 'server-only';
import { z } from 'zod';
import type { LeadWithRelations, Settings } from '@/lib/types';
import { getDefaultProvider } from './anthropic';
import { allowedEvidenceRefs, buildEvidenceText, buildSystemPrompt, DRAFT_JSON_SCHEMA } from './prompt';
import type { LLMProvider } from './provider';

export interface DraftRequest { lead: LeadWithRelations; channel: 'email' | 'linkedin'; settings: Settings; }
export interface DraftResult { subject: string | null; body: string; evidence_refs: string[]; }

export type { LLMProvider } from './provider';

const RawDraft = z.object({
  subject: z.string().nullable(),
  body: z.string().min(1),
  evidence_refs: z.array(z.string()),
});

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

function validate(raw: unknown, channel: 'email' | 'linkedin', allowed: Set<string>): DraftResult {
  const d = RawDraft.parse(raw);
  const body = d.body.trim();
  const limit = channel === 'email' ? 150 : 80;
  if (wordCount(body) > limit) throw new Error(`Draft body exceeds ${limit} words`);
  let subject: string | null = null;
  if (channel === 'email') {
    subject = d.subject?.trim() || null;
    if (!subject) throw new Error('Email draft is missing a subject');
  }
  const evidence_refs = [...new Set(d.evidence_refs.filter((r) => allowed.has(r)))];
  return { subject, body, evidence_refs };
}

export async function generateDraft(
  req: DraftRequest,
  provider: LLMProvider = getDefaultProvider(),
): Promise<DraftResult> {
  if (req.lead.contact?.do_not_contact) throw new Error('Contact is marked do-not-contact');

  const system = buildSystemPrompt(req.channel);
  const user = `${buildEvidenceText(req.lead, req.settings)}\n\nWrite the ${req.channel} draft now.`;
  const allowed = allowedEvidenceRefs(req.lead);

  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await provider.complete({ system, user, jsonSchema: DRAFT_JSON_SCHEMA as unknown as Record<string, unknown> });
    try {
      return validate(raw, req.channel, allowed);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Invalid draft output');
}
