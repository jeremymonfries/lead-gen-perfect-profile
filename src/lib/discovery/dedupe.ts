import type { CandidatePerson, SignalType } from '@/lib/types';

export interface StoryKey {
  company_name: string | null;
  signal_type: SignalType | null;
  people: CandidatePerson[];
  published_at: string | null;
}

const STOP = new Set(['pty', 'ltd', 'limited', 'inc', 'group', 'australia', 'au', 'the']);

/** Lowercase, strip punctuation and generic company words ("Pty Ltd", "Group", "Australia", "the", "& co"). */
export function normaliseOrg(name: string): string {
  const words = name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    if (words[i] === 'and' && words[i + 1] === 'co') { i++; continue; }
    if (STOP.has(words[i])) continue;
    out.push(words[i]);
  }
  return out.join(' ');
}

const DAY = 86_400_000;
const nameKey = (n: string) => n.trim().toLowerCase().replace(/\s+/g, ' ');
const key = (p: CandidatePerson) => nameKey(p.name);

export function isSameStory(a: StoryKey, b: StoryKey): boolean {
  if (!a.signal_type || a.signal_type !== b.signal_type) return false;

  if (a.company_name && b.company_name) {
    const oa = normaliseOrg(a.company_name);
    const ob = normaliseOrg(b.company_name);
    if (oa && oa === ob) {
      const ta = a.published_at ? Date.parse(a.published_at) : NaN;
      const tb = b.published_at ? Date.parse(b.published_at) : NaN;
      if (Number.isNaN(ta) || Number.isNaN(tb) || Math.abs(ta - tb) <= 14 * DAY) return true;
    }
  }

  const named = (p: CandidatePerson) => p.role === 'appointee' || p.role === 'new_partner';
  const keysA = new Set(a.people.filter(named).map(key).filter(Boolean));
  return b.people.some((p) => named(p) && keysA.has(key(p)));
}

/** Returns people from `extra` whose names are not already in `base` (case-insensitive). */
export function newPeople(base: CandidatePerson[], extra: CandidatePerson[]): CandidatePerson[] {
  const have = new Set(base.map(key));
  const out: CandidatePerson[] = [];
  for (const p of extra) {
    const k = key(p);
    if (!k || have.has(k)) continue;
    have.add(k);
    out.push(p);
  }
  return out;
}
