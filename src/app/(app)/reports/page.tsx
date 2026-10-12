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
    <div className="space-y-8">
      <Suspense fallback={<div className="space-y-6" aria-busy="true" aria-label="Loading report"><div className="panel h-16 animate-pulse bg-surface-container-high" /><div className="card h-64 animate-pulse bg-surface-container-high" /></div>}>
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
      <div className="page-header">
        <div>
          <h1>Outcomes</h1>
          <p className="page-sub">Win rates, revenue and estimate accuracy for leads created in the period.</p>
        </div>
        <div className="page-actions"><PeriodLinks current={period} /></div>
      </div>

      {t.leads === 0 ? (
        <div className="panel text-center text-on-surface-variant">No leads were created in this period. <Link href="/reports" className="link">Show all time</Link></div>
      ) : (
        <>
          {report.closed < 5 && (
            <p className="banner banner-warning">Too few closed leads to draw conclusions yet — keep recording won/lost outcomes.</p>
          )}
          <div className="kpi-strip kpi-lg">
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
                <thead><tr><th>Lead</th><th>Source</th><th className="num">Estimate (AUD)</th><th className="num">Actual</th><th className="num">Variance</th></tr></thead>
                <tbody>{report.won.map((w) => (
                  <tr key={w.id}>
                    <td><Link href={`/leads/${w.id}`} className="link">{w.title}</Link></td>
                    <td>{label(w.source)}</td>
                    <td className="num whitespace-nowrap">{fmtRange(w.low, w.high)}</td>
                    <td className="num">{fmtAUD(w.actual)}</td>
                    <td className={`num ${w.variance == null ? '' : w.variance >= 0 ? 'text-success' : 'text-error'}`}>{w.variance == null ? '—' : `${w.variance >= 0 ? '+' : ''}${(w.variance * 100).toFixed(0)}%`}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </Section>

          <Section title="Discovery effectiveness">
            {disc.origins.length === 0 ? <p className="text-body-medium text-on-surface-variant">No discovery candidates in this period.</p> : (
              <div className="overflow-x-auto"><table className="tbl">
                <thead><tr><th>Origin</th><th className="num">Found</th><th className="num">Accepted</th><th className="num">Rejected</th><th className="num">Acceptance</th><th className="num">Won</th><th className="num">Revenue</th></tr></thead>
                <tbody>
                  {[...disc.origins, disc.total].map((o, i, a) => (
                    <tr key={o.origin} className={i === a.length - 1 ? 'text-title-small' : ''}>
                      <td>{o.origin}</td><td className="num">{o.found}</td><td className="num">{o.accepted}</td><td className="num">{o.rejected}</td><td className="num">{pct(o.acceptanceRate)}</td><td className="num">{o.won}</td><td className="num">{fmtAUD(o.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
            <p className="meta mt-3 border-t border-outline-variant pt-3">
              Claude spend this period {fmtUsd(disc.spendUsd)}
              {Object.keys(disc.spendByJob).length > 0 && <> ({Object.entries(disc.spendByJob).map(([j, c]) => `${j} ${fmtUsd(c)}`).join(', ')})</>}
              {' · '}cost per accepted candidate {disc.costPerAcceptedUsd == null ? '—' : fmtUsd(disc.costPerAcceptedUsd)}
              {' · '}revenue per US$1 of Claude spend {disc.revenuePerUsd == null ? '—' : fmtAUD(disc.revenuePerUsd)}.
              {' '}Found excludes items Claude filtered as irrelevant; acceptance = accepted ÷ (accepted + rejected).
            </p>
          </Section>

          <div className="meta space-y-1">
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
  return <div className="kpi"><div className="kpi-label">{k}</div><div className="kpi-value">{v}</div>{sub && <div className="kpi-sub">{sub}</div>}</div>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h2 className="section-title">{title}</h2><div className="card overflow-hidden">{children}</div></section>;
}

function GroupTable({ rows, totals, first, compact }: { rows: GroupRow[]; totals?: GroupRow; first: string; compact?: boolean }) {
  const all = totals ? [...rows, totals] : rows;
  return (
    <div className="overflow-x-auto"><table className="tbl">
      <thead><tr><th>{first}</th><th className="num">Leads</th><th className="num">Contacted</th><th className="num">Meetings</th><th className="num">Proposals</th><th className="num">Won</th><th className="num">Lost</th><th className="num">Open</th><th className="num">Win rate</th><th className="num">Contact→win</th><th className="num">Revenue</th>{!compact && <th className="num">Est. (won)</th>}<th className="num">Avg deal</th></tr></thead>
      <tbody>
        {all.map((r) => (
          <tr key={r.key} className={r === totals ? 'text-title-small' : ''}>
            <td>{r === totals ? 'Total' : label(r.key)}{r !== totals && r.lowSample && <span className="ml-1 text-body-small text-on-surface-variant">small sample</span>}</td>
            <td className="num">{r.leads}</td><td className="num">{r.contacted}</td><td className="num">{r.meetings}</td><td className="num">{r.proposals}</td><td className="num">{r.won}</td><td className="num">{r.lost}</td><td className="num">{r.open}</td>
            <td className={`num ${r.lowSample && r !== totals ? 'text-on-surface-variant' : ''}`}>
              <div className="flex items-center justify-end gap-2"><span>{pct(r.winRate)}</span>
                {r.winRate != null && <span className="h-1.5 w-16 rounded-full bg-surface-container-highest" aria-hidden><span className={`block h-1.5 rounded-full ${r.lowSample ? 'bg-outline' : 'bg-primary'}`} style={{ width: `${Math.round(r.winRate * 100)}%` }} /></span>}
              </div>
            </td>
            <td className="num">{pct(r.contactToWin)}</td><td className="num">{fmtAUD(r.revenue)}</td>{!compact && <td className="num">{fmtAUD(r.estimateForWon)}</td>}<td className="num">{fmtAUD(r.avgDeal)}</td>
          </tr>
        ))}
      </tbody>
    </table></div>
  );
}
