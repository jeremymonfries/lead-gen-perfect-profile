import type { LeadWithRelations, Settings } from '@/lib/types';

export const DRAFT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    subject: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    body: { type: 'string' },
    evidence_refs: { type: 'array', items: { type: 'string' } },
  },
  required: ['subject', 'body', 'evidence_refs'],
  additionalProperties: false,
} as const;

export function buildSystemPrompt(channel: 'email' | 'linkedin'): string {
  const channelRule =
    channel === 'email'
      ? 'Channel: email. Provide a short, specific subject line and a body of at most 150 words.'
      : 'Channel: LinkedIn message. subject must be null. The body must be at most 80 words so it fits a LinkedIn message.';
  return [
    'You write first-touch outreach drafts for Perfect Profile, an Australian corporate photography business.',
    'Rules:',
    '- Use Australian English spelling and tone. Be short, specific and plain. No hype, no buzzwords, no exclamation marks.',
    '- Reference the actual buying signal from the evidence provided, in a natural way.',
    '- Where relevant, position on-site photography (team headshots at the client\'s workplace) and managed employee scheduling.',
    '- Use ONLY the facts in the EVIDENCE section. Never invent facts, prices, turnaround times, coverage areas, client names or claims.',
    '- You may state a capability or claim about Perfect Profile only if it appears in APPROVED CLAIMS. Do not make any claim that is not listed there.',
    '- If the evidence is thin, keep the draft generic and honest rather than guessing.',
    '- No placeholder brackets except the signature "[Your name]".',
    `- ${channelRule}`,
    '- evidence_refs: list the source URLs and/or signal ids (exactly as given in the evidence) that your draft relies on. Do not list anything else.',
    'Respond with JSON matching the provided schema.',
  ].join('\n');
}

const line = (label: string, v: unknown): string | null =>
  v === null || v === undefined || v === '' ? null : `${label}: ${String(v)}`;

export function buildEvidenceText(lead: LeadWithRelations, settings: Settings): string {
  const { company, contact } = lead;
  const out: string[] = ['EVIDENCE'];
  out.push(
    ...[
      line('Lead title', lead.title),
      line('Lead type', lead.lead_type),
      line('Lead source', lead.source),
      line('Notes', lead.notes),
      line('Recommended service', lead.recommended_service),
      line('Estimated headcount', lead.est_headcount),
      line('Estimated locations', lead.est_locations),
    ].filter((x): x is string => !!x),
  );
  if (company) {
    out.push('', 'Company:');
    out.push(
      ...[
        line('Name', company.name),
        line('Domain', company.domain),
        line('Industry', company.industry),
        line('Employee range', company.employee_range),
        line('City', company.city),
        line('State', company.state),
        line('Offices', company.office_count),
      ].filter((x): x is string => !!x),
    );
  }
  if (contact) {
    out.push('', 'Contact:');
    out.push(
      ...[line('Name', contact.name), line('Title', contact.title)].filter((x): x is string => !!x),
    );
  }
  out.push('', 'Signals:');
  if (lead.signals.length === 0) out.push('(none recorded)');
  for (const s of lead.signals) {
    out.push(
      `- id=${s.id} | type=${s.signal_type} | published=${s.published_at ?? 'unknown'} (${s.date_confidence}) | source_url=${s.source_url ?? 'none'}\n  summary: ${s.summary}`,
    );
  }

  out.push('', 'APPROVED CLAIMS (the only claims you may make about Perfect Profile):');
  if (settings.approved_claims.length === 0) out.push('(none approved - make no claims about Perfect Profile)');
  for (const c of settings.approved_claims) out.push(`- ${c}`);

  out.push('', 'SERVICE CATALOGUE:');
  if (settings.service_catalogue.length === 0) out.push('(empty)');
  for (const s of settings.service_catalogue) out.push(`- ${s.id}: ${s.name} - ${s.description}`);
  return out.join('\n');
}

export function allowedEvidenceRefs(lead: LeadWithRelations): Set<string> {
  const set = new Set<string>();
  for (const s of lead.signals) {
    set.add(s.id);
    if (s.source_url) set.add(s.source_url);
  }
  return set;
}
