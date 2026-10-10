import type { LeadType, SignalType } from '@/lib/types';

/** Likely buyers of corporate photography for a given signal. Hypotheses to refine against outcomes. */
const ROLES: Record<SignalType, string[]> = {
  new_office: ['People & Culture Manager', 'Office Manager', 'Marketing Manager'],
  rebrand: ['Marketing Manager', 'Brand Manager', 'Communications Manager'],
  hiring: ['People & Culture Manager', 'Talent Acquisition Manager'],
  exec_appointment: ['Executive Assistant', 'Communications Manager', 'Marketing Manager'],
  merger: ['Marketing Manager', 'Communications Manager', 'People & Culture Manager'],
  graduate_intake: ['Graduate Program Manager', 'People & Culture Manager'],
  onboarding: ['People & Culture Manager', 'Office Manager'],
  event: ['Events Manager', 'Marketing Manager'],
  business_launch: ['Founder', 'Marketing Manager'],
  team_page: ['Marketing Manager', 'Office Manager'],
  tender: ['Procurement Manager', 'Communications Manager'],
  other: ['Marketing Manager', 'People & Culture Manager'],
};
// Partner promotions are filed as exec appointments or hiring; professional firms buy through marketing/BD.
const FIRM_HINT = /\b(law|legal|lawyers|accounting|accountants|partners|consulting|advisory)\b/i;

export function buyerRoles(signal: SignalType | null, opts: { leadType?: LeadType; companyName?: string | null } = {}): string[] {
  const roles = [...ROLES[signal ?? 'other']];
  if (opts.companyName && FIRM_HINT.test(opts.companyName)) roles.unshift('Marketing & BD Manager');
  if (opts.leadType === 'individual') return ['The individual'];
  return [...new Set(roles)].slice(0, 3);
}

/** Opens a LinkedIn people search in the user's own browser. The tool never fetches LinkedIn. */
export function linkedInPeopleSearchUrl(company: string, roleOrName?: string): string {
  const keywords = [roleOrName, company].filter(Boolean).join(' ');
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(keywords)}`;
}
