import { z } from 'zod';
import type { LLMProvider } from '@/lib/llm/provider';
import type { CandidatePerson, LocationMatch, PersonRole, SignalType } from '@/lib/types';
import { cleanDomain } from './url';

export interface ClassifyInput { index: number; title: string; description: string | null; publisher: string | null; publishedAt: string | null; url: string; }
export interface Classification {
  index: number; relevant: boolean; signal_type: SignalType | null; company_name: string | null; company_domain: string | null;
  city: string | null; state: string | null; location_match: LocationMatch; est_headcount: number | null; summary: string; rationale: string; people: CandidatePerson[]; roundup: boolean;
}

const SIGNAL_TYPES = ['tender', 'rebrand', 'new_office', 'hiring', 'exec_appointment', 'merger', 'graduate_intake', 'onboarding', 'event', 'business_launch', 'team_page', 'other'] as const;
const LOCATION_MATCHES = ['melbourne', 'australia_other', 'outside_australia', 'unknown'] as const;

const PERSON_ROLES = ['appointee', 'new_partner', 'departing', 'spokesperson', 'other'] as const satisfies readonly PersonRole[];

const nullable = (type: string) => ({ anyOf: [{ type }, { type: 'null' }] });

export const CLASSIFY_JSON_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer' },
          relevant: { type: 'boolean' },
          signal_type: { anyOf: [{ type: 'string', enum: [...SIGNAL_TYPES] }, { type: 'null' }] },
          company_name: nullable('string'),
          company_domain: nullable('string'),
          city: nullable('string'),
          state: nullable('string'),
          location_match: { type: 'string', enum: [...LOCATION_MATCHES] },
          est_headcount: nullable('integer'),
          summary: { type: 'string' },
          rationale: { type: 'string' },
          roundup: { type: 'boolean' },
          people: {
            type: 'array',
            items: {
              type: 'object',
              properties: { name: { type: 'string' }, title: nullable('string'), role: { type: 'string', enum: [...PERSON_ROLES] } },
              required: ['name', 'title', 'role'],
              additionalProperties: false,
            },
          },
        },
        required: ['index', 'relevant', 'signal_type', 'company_name', 'company_domain', 'city', 'state', 'location_match', 'est_headcount', 'summary', 'rationale', 'people', 'roundup'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
} as const;

export function buildClassifySystemPrompt(): string {
  return `You triage Australian news results for Perfect Profile, a corporate headshot photography business in Melbourne, Australia. Perfect Profile sells corporate team headshots, on-site staff photography and executive/board portraits to organisations, Melbourne first.

For each numbered result decide whether it is a lead candidate.

RELEVANT only if the result names a specific organisation (or an executive at one) with a fresh buying signal, such as: new office or relocation, rebrand, hiring burst or expansion, executive or board appointment, partner promotions at professional firms, merger or acquisition, graduate intake, tender for photography, business launch, or a major event.

NOT RELEVANT: general market or economy news, consumer stories, sport, crime, opinion pieces, generic listicles (e.g. "10 tips for..."), organisations clearly operating only outside Australia, and articles where no organisation is named (except appointments roundups, below).

EVIDENCE ONLY: use only facts stated in the title and snippet. company_name, company_domain, city, state and est_headcount must be null unless stated. Set est_headcount only if a number of staff, hires or people is explicitly stated. Never guess or infer a domain.

LOCATION: these results come from Australian trade publications, so an organisation they cover should be treated as possibly Australian. Do NOT reject an item only because the snippet does not state an Australian presence: if it has a buying signal, keep it relevant and set location_match "unknown". Reject for location only when the snippet clearly places the organisation or role solely outside Australia (e.g. "global CEO based in New York", "expands into Auckland" with no Australian link); then set location_match "outside_australia" and relevant false.

location_match: "melbourne" only if Melbourne or the Victorian metro area is stated; "australia_other" if elsewhere in Australia; "outside_australia" if overseas; otherwise "unknown". The focus is Melbourne, but keep relevant Australia-wide organisations (they may have Melbourne staff) and set location_match honestly.

people: list every person NAMED in the title or snippet, with the title exactly as stated (null unless stated) and their role in the story: appointee = newly appointed or joining; new_partner = promoted or admitted to partnership; departing = leaving; spokesperson = quoted or announcing; other. Never invent names or titles. Empty array if no one is named.
People-move stories (someone joins, is appointed or is promoted at a named organisation) ARE relevant signals (exec_appointment, or hiring when several hires) even when the article is short; the organisation is the one they are joining. A departure alone is relevant only if it implies a replacement or appointment at a named organisation.

ROUNDUPS: an appointments or people-moves ROUNDUP (one article covering several organisations' appointments or promotions) IS relevant. Set roundup true, signal_type "exec_appointment", company_name null unless one organisation is clearly the subject, and people = any named people in the snippet. For every other item set roundup false.

signal_type: choose the closest type, or null if not relevant.
summary: one plain factual sentence (35 words or fewer) describing the signal.
rationale: 25 words or fewer on why it is or is not a lead.

Use Australian English. Return exactly one item per input index.`;
}

const str = z.string().nullish().transform((s) => s?.trim() || null);
const RawItem = z.object({
  index: z.number().int(),
  relevant: z.boolean(),
  signal_type: z.enum(SIGNAL_TYPES).nullish(),
  company_name: str,
  company_domain: str,
  city: str,
  state: str,
  location_match: z.enum(LOCATION_MATCHES),
  est_headcount: z.number().nullish(),
  summary: z.string().default(''),
  rationale: z.string().default(''),
  people: z.array(z.unknown()).nullish(),
  roundup: z.boolean().nullish(),
});
const RawPerson = z.object({ name: z.string(), title: z.string().nullish(), role: z.enum(PERSON_ROLES).catch('other') });
const RawOutput = z.object({ items: z.array(z.unknown()) });

function cleanPeople(raw: unknown[] | null | undefined): CandidatePerson[] {
  const seen = new Set<string>();
  const out: CandidatePerson[] = [];
  for (const x of raw ?? []) {
    const p = RawPerson.safeParse(x);
    if (!p.success) continue;
    const name = p.data.name.trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push({ name, title: p.data.title?.trim() || null, role: p.data.role });
    if (out.length >= 10) break;
  }
  return out;
}

function coerce(r: z.infer<typeof RawItem>): Classification {
  let relevant = r.relevant;
  let rationale = r.rationale.trim();
  const roundup = relevant && r.roundup === true;
  if (relevant && !r.company_name && !roundup) {
    relevant = false;
    rationale = `No organisation named. ${rationale}`.trim();
  }
  const hc = r.est_headcount;
  return {
    index: r.index,
    relevant,
    signal_type: relevant ? (roundup ? (r.signal_type ?? 'exec_appointment') : (r.signal_type ?? 'other')) : (r.signal_type ?? null),
    company_name: r.company_name,
    company_domain: cleanDomain(r.company_domain),
    city: r.city,
    state: r.state,
    location_match: r.location_match,
    est_headcount: typeof hc === 'number' && Number.isInteger(hc) && hc > 0 ? hc : null,
    summary: r.summary.trim().slice(0, 400),
    rationale,
    people: cleanPeople(r.people),
    roundup,
  };
}

function parseOutput(raw: unknown, valid: Set<number>): Map<number, Classification> {
  const out = RawOutput.parse(raw);
  const map = new Map<number, Classification>();
  for (const it of out.items) {
    const p = RawItem.safeParse(it);
    if (!p.success || !valid.has(p.data.index) || map.has(p.data.index)) continue;
    map.set(p.data.index, coerce(p.data));
  }
  return map;
}

export async function classifyBatch(items: ClassifyInput[], provider: LLMProvider): Promise<Map<number, Classification>> {
  const valid = new Set(items.map((i) => i.index));
  const user = `Classify these ${items.length} news results.\n\n` + items
    .map((i) => `[${i.index}] ${i.title} | ${i.publisher ?? 'unknown publisher'} | ${i.publishedAt ?? 'unknown date'} | ${i.url}\n  ${i.description ?? '(no snippet)'}`)
    .join('\n\n');
  const system = buildClassifySystemPrompt();

  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await provider.complete({ system, user, jsonSchema: CLASSIFY_JSON_SCHEMA as unknown as Record<string, unknown>, maxTokens: 400 * items.length + 500 });
      return parseOutput(raw, valid);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Invalid classification output');
}
