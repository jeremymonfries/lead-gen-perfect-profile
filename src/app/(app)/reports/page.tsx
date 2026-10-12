import { Suspense } from 'react';
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { getSettings } from '@/lib/db';
import { loadReportData } from '@/lib/db/reports';
import { fmtUsd } from '@/lib/db/usage';
import { buildOutcomes, PERIODS, parsePeriod, type GroupBy, type GroupRow, type Period } from '@/lib/reports/outcomes';
import { buildDiscoveryReport } from '@/lib/reports/discovery';
import { fmtAUD, fmtRange, label } from '@/components/format';

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
const pct = (n: number | null, digits = 0) => (n == null ? '—' : `${(n * 100).toFixed(digits)}%`);

export default function ReportsPage({ searchParams }: { searchParams: Promise<SP> }) {
  return (
    <div className="space-y-4">
      <Suspense fallback={<div className="space-y-4" aria-busy="true" aria-label="Loading report"><div className="card h-16 animate-pulse bg-surface-container-high" /><div className="card h-64 animate-pulse bg-surface-container-high" /></div>}>
        <ReportContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ReportContent({ searchParams }: { searchParams: Promise<SP> }) {
  await requireUser();
  const period = parsePeriod(one((await searchParams).period));
  const [data, settings] = await Promise.all([loadReportData(), getSettings()]);
  const now = new Date();
  const report = buildOutcomes(data.leads, data.activities, settings.score_bands, period, now);
  const disc = buildDiscoveryReport(data.candidates, data.leads, data.usage, period, now);
  const t = report.totals;
  const mv = report.medianVariance;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-headline-small">Outcomes</h1>
        <PeriodLinks current={period} />
      </div>

      {t.leads === 0 ? (
        <div className="card text-center text-on-surface-variant">No leads were created in this period. <Link href="/reports" className="link">Show all time</Link></div>
      ) : (
        <>
          {report.closed < 5 && (
            <p className="banner banner-warning">Too few closed leads to draw conclusions yet — keep recording won/lost outcomes.</p>
          )}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
            <Tile k="Leads" v={String(t.leads)} />
            <Tile k="Contacted" v={String(t.contacted)} />
            <Tile k="Won" v={String(t.won)} />
            <Tile k="Win rate" v={pct(t.winRate)} sub={t.winRate == null ? 'no closed leads' : `${t.won} of ${t.won + t.lost} closed`} />
            <Tile k="Actual revenue" v={fmtAUD(t.revenue)} />
            <Tile k="Estimate accuracy" v={mv == null ? '—' : `${Math.abs(mv * 100).toFixed(0)}% ${mv >= 0 ? 'above' : 'below'}`} sub={mv == null ? 'needs won leads with estimates' : 'median actual vs estimate'} />
            <Tile k="Claude spend" v={fmtUsd(disc.spendUsd)} />
          </div>

          <Section title="Funnel by source"><GroupTable rows={report.groups.source} totals={t} first="Source" /></Section>
          {([['lead_type', 'By lead type'], ['commercial_state', 'By commercial state'], ['score_band', 'By score band'], ['signal_type', 'By latest signal']] as [GroupBy, string][]).map(([g, title]) => (
            <Section key={g} title={title}><GroupTable rows={report.groups[g]} first={title.replace('By ', '')} compact /></Section>
          ))}

          <Section title="Won leads: estimate vs actual">
            {report.won.length === 0 ? <p className="text-body-medium text-on-surface-variant">No won leads in this period yet.</p> : (
              <div className="overflow-x-auto"><table className="tbl">
                <thead><tr><th>Lead</th><th>Source</th><th>Estimate (AUD)</th><th>Actual</th><th>Variance</th></tr></thead>
                <tbody>{report.won.map((w) => (
                  <tr key={w.id}>
                    <td><Link href={`/leads/${w.id}`} className="link">{w.title}</Link></td>
                    <td>{label(w.source)}</td>
                    <td className="whitespace-nowrap">{fmtRange(w.low, w.high)}</td>
                    <td>{fmtAUD(w.actual)}</td>
                    <td className={w.variance == null ? '' : w.variance >= 0 ? 'text-success' : 'text-error'}>{w.variance == null ? '—' : `${w.variance >= 0 ? '+' : ''}${(w.variance * 100).toFixed(0)}%`}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </Section>

          <Section title="Discovery effectiveness">
            {disc.origins.length === 0 ? <p className="text-body-medium text-on-surface-variant">No discovery candidates in this period.</p> : (
              <div className="overflow-x-auto"><table className="tbl">
                <thead><tr><th>Origin</th><th>Found</th><th>Accepted</th><th>Rejected</th><th>Acceptance</th><th>Won</th><th>Revenue</th></tr></thead>
                <tbody>
                  {[...disc.origins, disc.total].map((o, i, a) => (
                    <tr key={o.origin} className={i === a.length - 1 ? 'text-title-small' : ''}>
                      <td>{o.origin}</td><td>{o.found}</td><td>{o.accepted}</td><td>{o.rejected}</td><td>{pct(o.acceptanceRate)}</td><td>{o.won}</td><td>{fmtAUD(o.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
            <p className="mt-2 text-body-small text-on-surface-variant">
              Claude spend this period {fmtUsd(disc.spendUsd)}
              {Object.keys(disc.spendByJob).length > 0 && <> ({Object.entries(disc.spendByJob).map(([j, c]) => `${j} ${fmtUsd(c)}`).join(', ')})</>}
              {' · '}cost per accepted candidate {disc.costPerAcceptedUsd == null ? '—' : fmtUsd(disc.costPerAcceptedUsd)}
              {' · '}revenue per US$1 of Claude spend {disc.revenuePerUsd == null ? '—' : fmtAUD(disc.revenuePerUsd)}.
              {' '}Found excludes items Claude filtered as irrelevant; acceptance = accepted ÷ (accepted + rejected).
            </p>
          </Section>

          <div className="space-y-1 text-body-small text-on-surface-variant">
            <p>Values are estimates from the headcount proxy until pricing is set (SPEC §4). Score is for ranking only, not a probability.</p>
            <p>Win rate = won ÷ (won + lost). A lead counts as having reached a stage if it is there now or ever moved through it. Periods filter by lead created date.</p>
          </div>
        </>
      )}
    </>
  );
}

function PeriodLinks({ current }: { current: Period }) {
  return (
    <nav className="seg" aria-label="Period">
      {PERIODS.map((p) => (
        <Link key={p.id} href={p.id === 'all' ? '/reports' : `/reports?period=${p.id}`} aria-current={p.id === current ? 'page' : undefined}
          className="seg-item">{p.label}</Link>
      ))}
    </nav>
  );
}

function Tile({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return <div className="card"><div className="text-body-small text-on-surface-variant">{k}</div><div className="text-headline-small">{v}</div>{sub && <div className="text-body-small text-on-surface-variant">{sub}</div>}</div>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="card"><h2>{title}</h2>{children}</section>;
}

function GroupTable({ rows, totals, first, compact }: { rows: GroupRow[]; totals?: GroupRow; first: string; compact?: boolean }) {
  const all = totals ? [...rows, totals] : rows;
  return (
    <div className="overflow-x-auto"><table className="tbl">
      <thead><tr><th>{first}</th><th>Leads</th><th>Contacted</th><th>Meetings</th><th>Proposals</th><th>Won</th><th>Lost</th><th>Open</th><th>Win rate</th><th>Contact→win</th><th>Revenue</th>{!compact && <th>Est. (won)</th>}<th>Avg deal</th></tr></thead>
      <tbody>
        {all.map((r) => (
          <tr key={r.key} className={r === totals ? 'text-title-small' : ''}>
            <td>{r === totals ? 'Total' : label(r.key)}{r !== totals && r.lowSample && <span className="ml-1 text-body-small text-on-surface-variant">small sample</span>}</td>
            <td>{r.leads}</td><td>{r.contacted}</td><td>{r.meetings}</td><td>{r.proposals}</td><td>{r.won}</td><td>{r.lost}</td><td>{r.open}</td>
            <td className={r.lowSample && r !== totals ? 'text-on-surface-variant' : ''}>
              <div className="flex items-center gap-2"><span>{pct(r.winRate)}</span>
                {r.winRate != null && <span className="h-1.5 w-16 rounded-full bg-surface-container-highest" aria-hidden><span className={`block h-1.5 rounded-full ${r.lowSample ? 'bg-outline' : 'bg-primary'}`} style={{ width: `${Math.round(r.winRate * 100)}%` }} /></span>}
              </div>
            </td>
            <td>{pct(r.contactToWin)}</td><td>{fmtAUD(r.revenue)}</td>{!compact && <td>{fmtAUD(r.estimateForWon)}</td>}<td>{fmtAUD(r.avgDeal)}</td>
          </tr>
        ))}
      </tbody>
    </table></div>
  );
}
