import { Suspense } from 'react';
import { requireUser } from '@/lib/auth';
import { getSettings } from '@/lib/db';
import { SIGNAL_TYPES, label } from '@/components/format';
import { fmtUsd, monthStartIso, usageSummary } from '@/lib/db/usage';
import { LLM_MODELS } from '@/lib/llm/models';
import { updateSettingsAction } from './actions';

const Num = ({ name, children, value, step }: { name: string; children: string; value: number | null; step?: string }) => (
  <div>
    <label className="label" htmlFor={name}>{children}</label>
    <input id={name} name={name} type="number" step={step} defaultValue={value ?? ''} className="input" />
  </div>
);

export default function SettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  return (
    <div className="max-w-3xl space-y-6">
      <div className="page-header">
        <div>
          <h1>Settings</h1>
          <p className="page-sub">Models, pricing, scoring and the service catalogue.</p>
        </div>
      </div>
      <Suspense fallback={<SettingsSkeleton />}>
        <SettingsContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading settings">
      {Array.from({ length: 5 }, (_, i) => <div key={i} className="panel h-24 animate-pulse bg-surface-container-high" />)}
    </div>
  );
}

async function SettingsContent({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  await requireUser();
  const { saved } = await searchParams;
  const savedCount = saved !== undefined && /^\d+$/.test(saved) ? Number(saved) : null;
  const [s, usage] = await Promise.all([getSettings(), usageSummary(monthStartIso())]);
  const svc = [...s.service_catalogue, { id: '', name: '', description: '' }, { id: '', name: '', description: '' }];
  return (
    <div className="space-y-8">
      {savedCount !== null && (
        <div role="status" className="banner banner-success">
          Saved — {savedCount} {savedCount === 1 ? 'lead' : 'leads'} rescored
        </div>
      )}
      {s.price_per_head == null && (
        <div className="banner banner-warning">
          Pricing is unconfirmed (price per head is blank). Lead values use the headcount proxy below; unknown values are never invented.
        </div>
      )}
      <form action={updateSettingsAction} className="space-y-8">
        <section>
          <h2 className="section-title">Claude models (cost control)</h2>
          <p className="section-desc">Discovery runs and website lookups are frequent, so a cheap model is recommended. Set a monthly spend limit in the Anthropic Console too.</p>
          <div className="panel grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="llm_discovery">Discovery &amp; website lookup</label>
              <select id="llm_discovery" name="llm_discovery" defaultValue={s.llm_models.discovery} className="input">
                {LLM_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="llm_drafts">Outreach drafts</label>
              <select id="llm_drafts" name="llm_drafts" defaultValue={s.llm_models.drafts} className="input">
                {LLM_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>
            <p className="col-span-full border-t border-outline-variant pt-3 text-body-small text-on-surface-variant">
              <span className="text-title-small text-on-surface">This month: {fmtUsd(usage.total)}</span> · discovery {fmtUsd(usage.byJob.discovery)}, website lookups {fmtUsd(usage.byJob.website)}, drafts {fmtUsd(usage.byJob.draft)}; {usage.calls} {usage.calls === 1 ? 'call' : 'calls'}
            </p>
          </div>
        </section>
        <section>
          <h2 className="section-title">Commercial thresholds (A$)</h2>
          <div className="panel grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Num name="target_value" value={s.target_value}>Target value</Num>
            <Num name="floor_value" value={s.floor_value}>Hard floor</Num>
            <Num name="headcount_for_target" value={s.headcount_for_target}>Headcount for target (placeholder)</Num>
            <Num name="headcount_for_floor" value={s.headcount_for_floor}>Headcount for floor (placeholder)</Num>
          </div>
        </section>
        <section>
          <h2 className="section-title">Pricing</h2>
          <p className="section-desc">Blank = unknown.</p>
          <div className="panel grid grid-cols-2 gap-3">
            <Num name="price_base_fee" step="0.01" value={s.price_base_fee}>Base fee (A$)</Num>
            <Num name="price_per_head" step="0.01" value={s.price_per_head}>Per head (A$)</Num>
          </div>
        </section>
        <section>
          <h2 className="section-title">Score bands</h2>
          <p className="section-desc">Minimum score for each band.</p>
          <div className="panel grid grid-cols-3 gap-3">
            <Num name="band_high" value={s.score_bands.high}>High</Num>
            <Num name="band_review" value={s.score_bands.review}>Review</Num>
            <Num name="band_research" value={s.score_bands.research}>Needs research</Num>
          </div>
        </section>
        <section>
          <h2 className="section-title">Freshness window</h2>
          <p className="section-desc">Days per signal type.</p>
          <div className="panel grid grid-cols-2 gap-3 sm:grid-cols-4">
            {SIGNAL_TYPES.map((t) => <Num key={t} name={`fresh_${t}`} value={s.freshness_days[t]}>{label(t)}</Num>)}
          </div>
        </section>
        <section>
          <h2 className="section-title">Approved claims</h2>
          <p className="section-desc">One per line.</p>
          <div className="panel">
            <textarea name="approved_claims" rows={5} aria-label="Approved claims, one per line" defaultValue={s.approved_claims.join('\n')} className="input" />
          </div>
        </section>
        <section>
          <h2 className="section-title">Service catalogue</h2>
          <p className="section-desc">Clear the name to remove a service.</p>
          <div className="panel space-y-2">
            {svc.map((x, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-3">
                <input type="hidden" name={`svc_id_${i}`} value={x.id} />
                <input name={`svc_name_${i}`} defaultValue={x.name} placeholder="Name" aria-label="Service name" className="input" />
                <input name={`svc_desc_${i}`} defaultValue={x.description} placeholder="Description" aria-label="Service description" className="input sm:col-span-2" />
              </div>
            ))}
          </div>
        </section>
        <div className="flex justify-end border-t border-outline-variant pt-6">
          <button className="btn btn-primary" type="submit">Save settings</button>
        </div>
      </form>
      <section>
        <h2 className="section-title">Backup</h2>
        <p className="section-desc">Downloads all your leads, contacts, activity and discovery data as a file.</p>
        <div className="panel flex flex-wrap items-center gap-4">
          <a href="/api/backup" className="btn btn-tonal" download>Download backup</a>
          <p className="meta min-w-0 flex-1 basis-64">
            Keep it somewhere safe (e.g. iCloud Drive). For a full database backup, double-click “Back up Perfect Profile” in the project folder.
          </p>
        </div>
      </section>
    </div>
  );
}
