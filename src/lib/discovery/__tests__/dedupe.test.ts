import { describe, expect, it } from 'vitest';
import { isSameStory, newPeople, normaliseOrg, type StoryKey } from '../dedupe';

const s = (o: Partial<StoryKey> = {}): StoryKey => ({ company_name: 'WPP', signal_type: 'exec_appointment', people: [], published_at: '2026-10-08T00:00:00Z', ...o });
const person = (name: string, role: 'appointee' | 'new_partner' | 'departing' = 'appointee') => ({ name, title: null, role });

describe('normaliseOrg', () => {
  it('lowercases, strips punctuation and generic words', () => {
    expect(normaliseOrg('The WPP Group Australia Pty. Ltd.')).toBe('wpp');
    expect(normaliseOrg('Town Square')).toBe('town square');
    expect(normaliseOrg('Smith & Co')).toBe('smith');
    expect(normaliseOrg('AKQA, Inc')).toBe('akqa');
    expect(normaliseOrg('Acme Limited')).toBe('acme');
  });
});

describe('isSameStory', () => {
  it('matches same org + type within 14 days', () => {
    expect(isSameStory(s(), s({ company_name: 'WPP Pty Ltd', published_at: '2026-10-15T00:00:00Z' }))).toBe(true);
  });
  it('treats null dates as within range', () => {
    expect(isSameStory(s({ published_at: null }), s())).toBe(true);
  });
  it('rejects different type, org, or >14 days apart', () => {
    expect(isSameStory(s(), s({ signal_type: 'hiring' }))).toBe(false);
    expect(isSameStory(s(), s({ company_name: 'AKQA' }))).toBe(false);
    expect(isSameStory(s(), s({ published_at: '2026-09-01T00:00:00Z' }))).toBe(false);
  });
  it('matches a shared appointee across different org spellings, same type', () => {
    const a = s({ company_name: 'WPP Creative', people: [person('Tyler Turnbull')], published_at: '2026-01-01T00:00:00Z' });
    const b = s({ company_name: 'Wire Plastic Products', people: [person('tyler  turnbull')] });
    expect(isSameStory(a, b)).toBe(true);
    expect(isSameStory(a, { ...b, signal_type: 'hiring' })).toBe(false);
  });
  it('ignores shared departing people and null signal types', () => {
    expect(isSameStory(s({ company_name: 'A', people: [person('Jo', 'departing')] }), s({ company_name: 'B', people: [person('Jo', 'departing')] }))).toBe(false);
    expect(isSameStory(s({ signal_type: null }), s({ signal_type: null }))).toBe(false);
  });
});

describe('newPeople', () => {
  it('returns only names not already present', () => {
    expect(newPeople([person('Jo Bloggs')], [person('jo bloggs'), person('Al Smith')]).map((p) => p.name)).toEqual(['Al Smith']);
  });
});
