import type { Settings } from './types';

/** Defaults from SPEC.md §4-5. Headcount values are placeholders to confirm. */
export const DEFAULT_SETTINGS: Settings = {
  target_value: 2000,
  floor_value: 1400,
  headcount_for_target: 15,
  headcount_for_floor: 10,
  price_base_fee: null,
  price_per_head: null,
  score_bands: { high: 80, review: 65, research: 45 },
  freshness_days: {
    tender: 60,
    rebrand: 90,
    new_office: 90,
    hiring: 30,
    exec_appointment: 45,
    merger: 90,
    graduate_intake: 60,
    onboarding: 60,
    event: 30,
    business_launch: 60,
    team_page: 60,
    other: 60,
  },
  service_catalogue: [
    { id: 'corporate-team-headshots', name: 'Corporate team headshots', description: 'Consistent professional headshots for a whole team or company.' },
    { id: 'onsite-staff-photography', name: 'On-site staff photography', description: 'Photographers set up at the client office to shoot staff on site.' },
    { id: 'executive-board-portraits', name: 'Executive & board portraits', description: 'Premium portraits for executives and board members.' },
    { id: 'brand-photography', name: 'Brand photography', description: 'Environmental and brand imagery for websites and marketing.' },
    { id: 'individual-headshot-linkedin', name: 'Individual headshot + LinkedIn optimisation', description: 'Single professional headshot with LinkedIn profile optimisation.' },
  ],
  approved_claims: [],
};
