'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { getSettings, updateSettings, listLeads } from '@/lib/db';
import { recompute } from '../leads/actions';
import type { Settings } from '@/lib/types';
import { SIGNAL_TYPES } from '@/components/format';

const numOrNull = (v: FormDataEntryValue | null): number | null => {
  if (typeof v !== 'string' || v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function updateSettingsAction(formData: FormData) {
  await requireUser();
  const cur = await getSettings();
  const n = (k: string, fallback: number) => numOrNull(formData.get(k)) ?? fallback;

  const freshness_days = { ...cur.freshness_days };
  for (const t of SIGNAL_TYPES) freshness_days[t] = n(`fresh_${t}`, cur.freshness_days[t]);

  const service_catalogue: Settings['service_catalogue'] = [];
  for (let i = 0; formData.has(`svc_name_${i}`); i++) {
    const name = String(formData.get(`svc_name_${i}`) ?? '').trim();
    if (!name) continue;
    const existing = String(formData.get(`svc_id_${i}`) ?? '').trim();
    const id = existing || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `service-${i}`;
    service_catalogue.push({ id, name, description: String(formData.get(`svc_desc_${i}`) ?? '').trim() });
  }

  await updateSettings({
    target_value: n('target_value', cur.target_value),
    floor_value: n('floor_value', cur.floor_value),
    headcount_for_target: n('headcount_for_target', cur.headcount_for_target),
    headcount_for_floor: n('headcount_for_floor', cur.headcount_for_floor),
    price_base_fee: numOrNull(formData.get('price_base_fee')),
    price_per_head: numOrNull(formData.get('price_per_head')),
    score_bands: { high: n('band_high', cur.score_bands.high), review: n('band_review', cur.score_bands.review), research: n('band_research', cur.score_bands.research) },
    freshness_days,
    approved_claims: String(formData.get('approved_claims') ?? '').split('\n').map((s) => s.trim()).filter(Boolean),
    service_catalogue,
  });
  // Rescore every lead against the new settings; manual value overrides are preserved by recompute.
  const leads = await listLeads();
  for (const l of leads) await recompute(l.id);
  revalidatePath('/settings');
  revalidatePath('/leads');
  redirect(`/settings?saved=${leads.length}`);
}
