import { Suspense } from 'react';
import { requireUser } from '@/lib/auth';
import { getSettings } from '@/lib/db';
import { SIGNAL_TYPES, label } from '@/components/format';
import { updateSettingsAction } from './actions';

const Num = ({ name, children, value, step }: { name: string; children: string; value: number | null; step?: string }) => (
  <div>
    <label className="label" htmlFor={name}>{children}</label>
    <input id={name} name={name} type="number" step={step} defaultValue={value ?? ''} className="input" />
  </div>
);

export default function SettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold">Settings</h1>
      <Suspense fallback={<SettingsSkeleton />}>
        <SettingsContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading settings">
      {Array.from({ length: 5 }, (_, i) => <div key={i} className="card h-24 animate-pulse bg-gray-100" />)}
    </div>
  );
}

async function SettingsContent({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  await requireUser();
  const { saved } = await searchParams;
  const savedCount = saved !== undefined && /^\d+$/.test(saved) ? Number(saved) : null;
  const s = await getSettings();
  const svc = [...s.service_catalogue, { id: '', name: '', description: '' }, { id: '', name: '', description: '' }];
  return (
    <div className="space-y-4">
      {savedCount !== null && (
        <div role="status" className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900">
          Saved — {savedCount} {savedCount === 1 ? 'lead' : 'leads'} rescored
        </div>
      )}
      {s.price_per_head == null && (
        <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Pricing is unconfirmed (price per head is blank). Lead values use the headcount proxy below; unknown values are never invented.
        </div>
      )}
      <form action={updateSettingsAction} className="space-y-4">
        <section className="card grid grid-cols-2 gap-3 sm:grid-cols-4">
          <h2 className="col-span-full">Commercial thresholds (A$)</h2>
          <Num name="target_value" value={s.target_value}>Target value</Num>
          <Num name="floor_value" value={s.floor_value}>Hard floor</Num>
          <Num name="headcount_for_target" value={s.headcount_for_target}>Headcount for target (placeholder)</Num>
          <Num name="headcount_for_floor" value={s.headcount_for_floor}>Headcount for floor (placeholder)</Num>
        </section>
        <section className="card grid grid-cols-2 gap-3">
          <h2 className="col-span-full">Pricing (blank = unknown)</h2>
          <Num name="price_base_fee" step="0.01" value={s.price_base_fee}>Base fee (A$)</Num>
          <Num name="price_per_head" step="0.01" value={s.price_per_head}>Per head (A$)</Num>
        </section>
        <section className="card grid grid-cols-3 gap-3">
          <h2 className="col-span-full">Score bands (minimum score)</h2>
          <Num name="band_high" value={s.score_bands.high}>High</Num>
          <Num name="band_review" value={s.score_bands.review}>Review</Num>
          <Num name="band_research" value={s.score_bands.research}>Needs research</Num>
        </section>
        <section className="card grid grid-cols-2 gap-3 sm:grid-cols-4">
          <h2 className="col-span-full">Freshness window (days) per signal type</h2>
          {SIGNAL_TYPES.map((t) => <Num key={t} name={`fresh_${t}`} value={s.freshness_days[t]}>{label(t)}</Num>)}
        </section>
        <section className="card">
          <h2>Approved claims (one per line)</h2>
          <textarea name="approved_claims" rows={5} defaultValue={s.approved_claims.join('\n')} className="input" />
        </section>
        <section className="card space-y-2">
          <h2>Service catalogue (clear the name to remove)</h2>
          {svc.map((x, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-3">
              <input type="hidden" name={`svc_id_${i}`} value={x.id} />
              <input name={`svc_name_${i}`} defaultValue={x.name} placeholder="Name" className="input" />
              <input name={`svc_desc_${i}`} defaultValue={x.description} placeholder="Description" className="input sm:col-span-2" />
            </div>
          ))}
        </section>
        <button className="btn btn-primary" type="submit">Save settings</button>
      </form>
    </div>
  );
}
