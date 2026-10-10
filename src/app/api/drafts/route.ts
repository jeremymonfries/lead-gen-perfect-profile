import 'server-only';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getLead, getSettings, logActivity, markDraftCopied, saveDraft } from '@/lib/db';
import { generateDraft } from '@/lib/llm';

const PostBody = z.object({ leadId: z.string().min(1), channel: z.enum(['email', 'linkedin']) });
const PatchBody = z.object({ draftId: z.string().min(1), leadId: z.string().min(1) });

const err = (error: string, status: number) => NextResponse.json({ error }, { status });

function isAuthError(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e);
  return /not authenticated|unauthori[sz]ed|jwt|auth session|not logged in|permission denied/i.test(m);
}

function fail(e: unknown) {
  if (isAuthError(e)) return err('Unauthorised', 401);
  const msg = e instanceof Error ? e.message : 'Internal error';
  return err(msg, msg === 'Contact is marked do-not-contact' ? 400 : 500);
}

async function readJson(req: Request): Promise<unknown> {
  try { return await req.json(); } catch { return undefined; }
}

export async function POST(req: Request) {
  const parsed = PostBody.safeParse(await readJson(req));
  if (!parsed.success) return err('Invalid request body', 400);
  const { leadId, channel } = parsed.data;
  try {
    const lead = await getLead(leadId);
    if (!lead) return err('Lead not found', 404);
    const settings = await getSettings();
    const draft = await generateDraft({ lead, channel, settings });
    const saved = await saveDraft({
      lead_id: leadId,
      channel,
      subject: draft.subject,
      body: draft.body,
      evidence_refs: draft.evidence_refs,
    });
    await logActivity(leadId, 'draft_generated', `${channel} draft generated`, { draft_id: saved.id, channel });
    return NextResponse.json(saved);
  } catch (e) {
    return fail(e);
  }
}

export async function PATCH(req: Request) {
  const parsed = PatchBody.safeParse(await readJson(req));
  if (!parsed.success) return err('Invalid request body', 400);
  const { draftId, leadId } = parsed.data;
  try {
    await markDraftCopied(draftId);
    await logActivity(leadId, 'draft_copied', undefined, { draft_id: draftId });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
