/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('../anthropic', () => ({ getDefaultProvider: () => ({ complete: vi.fn() }) }));

import { generateDraft } from '../index';
import type { LLMProvider } from '../provider';

const lead: any = {
  id: 'lead1', title: 'Acme hiring', lead_type: 'corporate', source: 'linkedin', notes: 'Met at event',
  recommended_service: 'on-site photography', est_headcount: 40, est_locations: 2,
  company: { name: 'Acme Pty Ltd', domain: 'acme.com.au', industry: 'Legal', city: 'Melbourne', state: 'VIC' },
  contact: { name: 'Sam Lee', title: 'HR Manager', do_not_contact: false },
  signals: [{ id: 'sig-1', signal_type: 'hiring', summary: 'Acme is hiring 12 graduates for February intake', source_url: 'https://acme.com.au/careers', published_at: '2026-09-30', date_confidence: 'exact' }],
};
const settings: any = {
  approved_claims: ['Photographers come to your office'],
  service_catalogue: [{ id: 'onsite', name: 'On-site headshots', description: 'Team headshots at your workplace' }],
};
const good = { subject: 'Graduate intake headshots', body: 'Hi Sam, saw the graduate intake. Happy to chat.\n[Your name]', evidence_refs: ['sig-1', 'https://acme.com.au/careers', 'https://made-up.example', 'sig-999'] };
const prov = (out: unknown): LLMProvider & { complete: ReturnType<typeof vi.fn> } => ({ complete: vi.fn().mockResolvedValue(out) });

describe('generateDraft', () => {
  it('throws on do-not-contact before calling the model', async () => {
    const p = prov(good);
    const l = { ...lead, contact: { ...lead.contact, do_not_contact: true } };
    await expect(generateDraft({ lead: l, channel: 'email', settings }, p)).rejects.toThrow('Contact is marked do-not-contact');
    expect(p.complete).not.toHaveBeenCalled();
  });

  it('filters evidence_refs to supplied urls/signal ids', async () => {
    const r = await generateDraft({ lead, channel: 'email', settings }, prov(good));
    expect(r.evidence_refs).toEqual(['sig-1', 'https://acme.com.au/careers']);
    expect(r.subject).toBe('Graduate intake headshots');
  });

  it('rejects malformed output', async () => {
    await expect(generateDraft({ lead, channel: 'email', settings }, prov({ body: 5 }))).rejects.toThrow();
    await expect(generateDraft({ lead, channel: 'email', settings }, prov('nope'))).rejects.toThrow();
  });

  it('enforces channel rules (linkedin subject null, word limits)', async () => {
    const r = await generateDraft({ lead, channel: 'linkedin', settings }, prov(good));
    expect(r.subject).toBeNull();
    const long = { ...good, body: Array(100).fill('word').join(' ') };
    await expect(generateDraft({ lead, channel: 'linkedin', settings }, prov(long))).rejects.toThrow(/80 words/);
  });

  it('builds prompt from evidence and approved claims only', async () => {
    const p = prov(good);
    await generateDraft({ lead, channel: 'email', settings }, p);
    const arg = p.complete.mock.calls[0][0];
    expect(arg.user).toContain('Acme is hiring 12 graduates for February intake');
    expect(arg.user).toContain('https://acme.com.au/careers');
    expect(arg.user).toContain('Photographers come to your office');
    expect(arg.user).not.toContain('24-hour turnaround');
    expect(arg.system).toMatch(/Never invent facts/);
    expect(arg.system).toMatch(/only if it appears in APPROVED CLAIMS/);
    expect(arg.system).toContain('Australian English');
  });

  it('retries once on invalid output then succeeds', async () => {
    const p: any = { complete: vi.fn().mockResolvedValueOnce({ bad: 1 }).mockResolvedValueOnce(good) };
    const r = await generateDraft({ lead, channel: 'email', settings }, p);
    expect(r.body).toContain('graduate');
    expect(p.complete).toHaveBeenCalledTimes(2);
  });
});
