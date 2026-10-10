import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { getLead, getSettings, listActivities, listDrafts } from '@/lib/db';
import { estimateValue, scoreBand } from '@/lib/scoring';
import { StateBadge, BandBadge, StatusBadge } from '@/components/badges';
import { DraftGenerator } from '@/components/draft-generator';
import { STATUSES, fmtAUD, fmtDate, fmtDateTime, fmtRange, label } from '@/components/format';
import { addNote, changeStatus, recordOutcome, saveEstimates } from '../actions';

const Hidden = ({ id }: { id: string }) => <input type="hidden" name="lead_id" value={id} />;
const Field = ({ name, children, defaultValue, type = 'text', step }: { name: string; children: string; defaultValue?: string | number | null; type?: string; step?: string }) => (
  <div>
    <label className="label" htmlFor={name}>{children}</label>
    <input id={name} name={name} type={type} step={step} defaultValue={defaultValue ?? ''} className="input" />
  </div>
);

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const [lead, settings] = await Promise.all([getLead(id), getSettings()]);
  if (!lead) notFound();
  const [activities, drafts] = await Promise.all([listActivities(id), listDrafts(id)]);

  const est = estimateValue(lead, settings);
  const valueMatchesEstimate = est.low === lead.est_value_low && est.high === lead.est_value_high;
  const basis = lead.est_value_low == null && lead.est_value_high == null ? 'unknown' : valueMatchesEstimate ? est.basis : 'manual';
  const manualValue = basis === 'manual';
  const bd = lead.score_breakdown;
  const dnc = lead.contact?.do_not_contact === true;
  const signals = [...lead.signals].sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? ''));

  const known: [string, boolean][] = [
    ['Headcount', lead.est_headcount != null],
    ['Estimated value', lead.est_value_low != null || lead.est_value_high != null],
    ['Contact', !!lead.contact && !!(lead.contact.email || lead.contact.linkedin_url)],
    ['Signal date', signals.some((s) => !!s.published_at)],
  ];

  return (
    <div className="space-y-4">
      {dnc && <div className="rounded border border-red-300 bg-red-50 px-3 py-2 font-semibold text-red-800">DO NOT CONTACT — this contact is flagged. Do not send outreach.</div>}
      <div>
        <Link href="/leads" className="link text-xs">← Leads</Link>
        <h1 className="text-xl font-semibold">{lead.title}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-600">
          <StatusBadge status={lead.status} /><StateBadge state={lead.commercial_state} />
          {lead.score != null && <span>Score {lead.score} <BandBadge band={scoreBand(lead.score, settings)} /></span>}
          <span>{lead.lead_type} · source {lead.source} · created {fmtDate(lead.created_at)}</span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <section className="card">
            <h2>Summary</h2>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
              <div><dt className="label">Recommended service</dt><dd>{lead.recommended_service ?? '—'}</dd></div>
              <div><dt className="label">Next action</dt><dd>{lead.next_action ?? '—'}</dd></div>
              <div><dt className="label">Headcount / locations</dt><dd>{lead.est_headcount ?? '—'} / {lead.est_locations ?? '—'}</dd></div>
              <div><dt className="label">Exception reason</dt><dd>{lead.exception_reason ?? '—'}</dd></div>
              {lead.actual_revenue != null && <div><dt className="label">Actual revenue</dt><dd>{fmtAUD(lead.actual_revenue)}</dd></div>}
            </dl>
            {lead.notes && <p className="mt-2 whitespace-pre-wrap text-sm">{lead.notes}</p>}
          </section>

          <section className="card">
            <h2>Company &amp; contact</h2>
            <div className="grid gap-3 sm:grid-cols-2 text-sm">
              <div>
                <div className="label">Company</div>
                {lead.company ? <>
                  <div className="font-medium">{lead.company.name}</div>
                  <div>{[lead.company.city, lead.company.state].filter(Boolean).join(', ') || '—'}</div>
                  {lead.company.domain && <a className="link" href={`https://${lead.company.domain}`} target="_blank" rel="noreferrer">{lead.company.domain}</a>}
                </> : '—'}
              </div>
              <div>
                <div className="label">Contact</div>
                {lead.contact ? <>
                  <div className="font-medium">{lead.contact.name}{lead.contact.verified && ' ✓'}</div>
                  <div>{lead.contact.title ?? '—'}</div>
                  {lead.contact.email && <div>{lead.contact.email}</div>}
                  {lead.contact.linkedin_url && <a className="link" href={lead.contact.linkedin_url} target="_blank" rel="noreferrer">LinkedIn</a>}
                </> : '—'}
              </div>
            </div>
          </section>

          <section className="card">
            <h2>Evidence &amp; signals</h2>
            {signals.length === 0 ? <p className="text-sm text-gray-500">No signals recorded.</p> : (
              <ul className="space-y-2 text-sm">
                {signals.map((s) => (
                  <li key={s.id}>
                    <span className="badge bg-gray-100">{label(s.signal_type)}</span>{' '}
                    <span className="text-gray-500">{fmtDate(s.published_at)} ({s.date_confidence})</span>
                    {s.contribution != null && <span className="text-gray-500"> · +{s.contribution}</span>}
                    <div>{s.summary}</div>
                    {s.source_url && <a className="link break-all text-xs" href={s.source_url} target="_blank" rel="noreferrer">{s.source_url}</a>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <h2>Score breakdown (ranking only, not a probability)</h2>
            {!bd ? <p className="text-sm text-gray-500">Not scored yet.</p> : (
              <>
                <table className="tbl max-w-md">
                  <tbody>
                    {([['Buying signal', bd.signal, 25], ['Viable project', bd.viability, 25], ['Service fit', bd.fit, 20], ['Timing / freshness', bd.timing, 15], ['Evidence & buyer', bd.evidence, 15]] as const).map(([n, v, max]) => (
                      <tr key={n}><td>{n}</td><td className="text-right">{v} / {max}</td></tr>
                    ))}
                    <tr className="font-semibold"><td>Total</td><td className="text-right">{bd.total} / 100</td></tr>
                  </tbody>
                </table>
                {bd.notes.length > 0 && <ul className="mt-2 list-disc pl-5 text-sm text-gray-600">{bd.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
              </>
            )}
          </section>

          <section className="card">
            <h2>Activity</h2>
            {activities.length === 0 ? <p className="text-sm text-gray-500">No activity.</p> : (
              <ul className="space-y-2 text-sm">
                {activities.map((a) => (
                  <li key={a.id} className="border-l-2 border-[var(--line)] pl-3">
                    <span className="font-medium">{label(a.activity_type)}</span> <span className="text-xs text-gray-500">{fmtDateTime(a.created_at)}</span>
                    {a.detail && <div className="whitespace-pre-wrap">{a.detail}</div>}
                  </li>
                ))}
              </ul>
            )}
            <form action={addNote} className="mt-3 flex gap-2">
              <Hidden id={lead.id} />
              <input name="note" placeholder="Add a note…" className="input" required />
              <button className="btn" type="submit">Add note</button>
            </form>
          </section>

          <section className="card">
            <h2>Outreach drafts</h2>
            <DraftGenerator leadId={lead.id} disabled={dnc} />
            {drafts.length > 0 && (
              <ul className="mt-3 space-y-3">
                {drafts.map((d) => (
                  <li key={d.id} className="rounded border border-[var(--line)] p-2 text-sm">
                    <div className="mb-1 text-xs text-gray-500">{d.channel}{d.subject ? ` · ${d.subject}` : ''} · {fmtDateTime(d.created_at)} · {d.copied_at ? `copied ${fmtDateTime(d.copied_at)}` : 'not copied'}</div>
                    <pre className="whitespace-pre-wrap font-sans">{d.body}</pre>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="space-y-4">
          <section className="card">
            <h2>Commercial</h2>
            <div className="mb-1"><StateBadge state={lead.commercial_state} /></div>
            <div className="text-lg font-semibold">{fmtRange(lead.est_value_low, lead.est_value_high)} <span className="text-xs font-normal text-gray-500">estimate</span></div>
            <div className="text-xs text-gray-500">Basis: {label(basis)}. Target {fmtAUD(settings.target_value)}, floor {fmtAUD(settings.floor_value)}.</div>
            {lead.assumptions && <p className="mt-1 text-sm">{lead.assumptions}</p>}
            {settings.price_per_head == null && <p className="mt-1 text-xs text-amber-700">Pricing unconfirmed — value is a headcount proxy.</p>}
            <h3 className="label mt-3">Known vs unknown</h3>
            <ul className="text-sm">
              {known.map(([n, ok]) => <li key={n} className={ok ? 'text-green-700' : 'text-amber-700'}>{ok ? '✓' : '?'} {n}{ok ? '' : ' — unknown'}</li>)}
            </ul>
          </section>

          <section className="card">
            <h2>Status</h2>
            <form action={changeStatus} className="flex gap-2">
              <Hidden id={lead.id} />
              <select name="status" defaultValue={lead.status} className="input">{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
              <button className="btn" type="submit">Update</button>
            </form>
          </section>

          <section className="card">
            <h2>Edit estimates</h2>
            <form action={saveEstimates} className="grid grid-cols-2 gap-2">
              <Hidden id={lead.id} />
              <Field name="est_headcount" type="number" defaultValue={lead.est_headcount}>Headcount</Field>
              <Field name="est_locations" type="number" defaultValue={lead.est_locations}>Locations</Field>
              <Field name="value_low" type="number" defaultValue={manualValue ? lead.est_value_low : null}>Value low override (A$)</Field>
              <Field name="value_high" type="number" defaultValue={manualValue ? lead.est_value_high : null}>Value high override (A$)</Field>
              <p className="col-span-2 text-xs text-gray-500">Leave value blank to use the automatic estimate.</p>
              <div className="col-span-2"><Field name="exception_reason" defaultValue={lead.exception_reason}>Exception reason</Field></div>
              <div className="col-span-2">
                <label className="label" htmlFor="recommended_service">Recommended service</label>
                <select id="recommended_service" name="recommended_service" defaultValue={lead.recommended_service ?? ''} className="input">
                  <option value="">—</option>
                  {settings.service_catalogue.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
                  {lead.recommended_service && !settings.service_catalogue.some((s) => s.name === lead.recommended_service) && <option value={lead.recommended_service}>{lead.recommended_service}</option>}
                </select>
              </div>
              <div className="col-span-2"><Field name="next_action" defaultValue={lead.next_action}>Next action</Field></div>
              <div className="col-span-2"><button className="btn btn-primary" type="submit">Save &amp; recompute</button></div>
            </form>
          </section>

          <section className="card">
            <h2>Record outcome</h2>
            <form action={recordOutcome} className="mb-3 flex items-end gap-2">
              <Hidden id={lead.id} /><input type="hidden" name="outcome" value="won" />
              <div className="flex-1"><Field name="actual_revenue" type="number" step="0.01" defaultValue={lead.actual_revenue}>Won — actual revenue (A$)</Field></div>
              <button className="btn" type="submit">Mark won</button>
            </form>
            <form action={recordOutcome} className="flex items-end gap-2">
              <Hidden id={lead.id} /><input type="hidden" name="outcome" value="lost" />
              <div className="flex-1"><Field name="reason">Lost — reason</Field></div>
              <button className="btn" type="submit">Mark lost</button>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
