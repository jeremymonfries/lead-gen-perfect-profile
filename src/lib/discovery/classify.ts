import { z } from 'zod';
import type { LLMProvider } from '@/lib/llm/provider';
import type { LocationMatch, SignalType } from '@/lib/types';
import { cleanDomain } from './url';

export interface ClassifyInput { index: number; title: string; description: string | null; publisher: string | null; publishedAt: string | null; url: string; }
export interface Classification {
  index: number; relevant: boolean; signal_type: SignalType | null; company_name: string | null; company_domain: string | null;
  city: string | null; state: string | null; location_match: LocationMatch; est_headcount: number | null; summary: string; rationale: string;
}

const SIGNAL_TYPES = ['tender', 'rebrand', 'new_office', 'hiring', 'exec_appointment', 'merger', 'graduate_intake', 'onboarding', 'event', 'business_launch', 'team_page', 'other'] as const;
const LOCATION_MATCHES = ['melbourne', 'australia_other', 'outside_australia', 'unknown'] as const;

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
        },
        required: ['index', 'relevant', 'signal_type', 'company_name', 'company_domain', 'city', 'state', 'location_match', 'est_headcount', 'summary', 'rationale'],
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

NOT RELEVANT: general market or economy news, consumer stories, sport, crime, opinion pieces, listicles, companies with no Australian presence, and articles where no organisation is named.

EVIDENCE ONLY: use only facts stated in the title and snippet. company_name, company_domain, city, state and est_headcount must be null unless stated. Set est_headcount only if a number of staff, hires or people is explicitly stated. Never guess or infer a domain.

location_match: "melbourne" only if Melbourne or the Victorian metro area is stated; "australia_other" if elsewhere in Australia; "outside_australia" if overseas; otherwise "unknown". The focus is Melbourne, but keep relevant Australia-wide organisations (they may have Melbourne staff) and set location_match honestly.

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
});
const RawOutput = z.object({ items: z.array(z.unknown()) });

function coerce(r: z.infer<typeof RawItem>): Classification {
  let relevant = r.relevant;
  let rationale = r.rationale.trim();
  if (relevant && !r.company_name) {
    relevant = false;
    rationale = `No organisation named. ${rationale}`.trim();
  }
  const hc = r.est_headcount;
  return {
    index: r.index,
    relevant,
    signal_type: relevant ? (r.signal_type ?? 'other') : (r.signal_type ?? null),
    company_name: r.company_name,
    company_domain: cleanDomain(r.company_domain),
    city: r.city,
    state: r.state,
    location_match: r.location_match,
    est_headcount: typeof hc === 'number' && Number.isInteger(hc) && hc > 0 ? hc : null,
    summary: r.summary.trim().slice(0, 400),
    rationale,
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
      const raw = await provider.complete({ system, user, jsonSchema: CLASSIFY_JSON_SCHEMA as unknown as Record<string, unknown>, maxTokens: 300 * items.length + 500 });
      return parseOutput(raw, valid);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Invalid classification output');
}
