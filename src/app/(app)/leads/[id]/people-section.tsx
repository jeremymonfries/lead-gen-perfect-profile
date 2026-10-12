import { listCompanyContacts } from '@/lib/db/contacts';
import { buyerRoles, linkedInPeopleSearchUrl } from '@/lib/discovery/buyer-roles';
import type { LeadWithRelations } from '@/lib/types';
import { addPersonAction, findPeopleAction, setPrimaryContactAction } from '../people-actions';
import { FindPeopleButton } from './find-people-button';

const ext = { target: '_blank', rel: 'noopener noreferrer' } as const;

export async function PeopleSection({ lead }: { lead: LeadWithRelations }) {
  const company = lead.company;
  if (!company) {
    return (
      <section className="card">
        <h2>People to contact</h2>
        <p className="text-body-medium text-on-surface-variant">Add a company to this lead first, then you can look up people to contact.</p>
      </section>
    );
  }

  const people = await listCompanyContacts(company.id);
  const latest = [...lead.signals].sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? ''))[0];
  const roles = buyerRoles(latest?.signal_type ?? null, { leadType: lead.lead_type, companyName: company.name });
  const hasKey = !!process.env.ANTHROPIC_API_KEY;
  const canFind = !!company.domain && hasKey;
  const why = !company.domain ? 'Add a company website domain to enable this.' : !hasKey ? 'ANTHROPIC_API_KEY is not set.' : null;

  return (
    <section className="card space-y-5">
      <h2>People to contact</h2>

      <div>
        <h3>Who to look for</h3>
        <ul className="flex flex-wrap gap-2 text-body-medium">
          {roles.map((r) => (
            <li key={r} className="badge gap-2 bg-surface-container-high text-on-surface">
              <span>{r}</span>
              <a className="link" href={linkedInPeopleSearchUrl(company.name, r)} {...ext}>Search LinkedIn</a>
            </li>
          ))}
        </ul>
        <p className="meta mt-1">Opens LinkedIn in your browser — find the person, then add them below.</p>
      </div>

      <div>
        <h3>People on file at {company.name}</h3>
        {people.length === 0 ? <p className="text-body-medium text-on-surface-variant">No people on file yet.</p> : (
          <ul className="divide-y divide-outline-variant text-body-medium">
            {people.map((p) => (
              <li key={p.id} className="flex flex-col gap-1 py-3 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-title-small">{p.name}</span>
                    {!p.verified && <span className="badge bg-warning-container text-on-warning-container">unverified</span>}
                    {p.do_not_contact && <span className="badge bg-error-container text-on-error-container text-label-medium">DO NOT CONTACT</span>}
                    {lead.contact_id === p.id && <span className="badge bg-success-container text-on-success-container">Primary</span>}
                  </div>
                  <div>{p.title ?? '—'}</div>
                  {p.source_note && <div className="break-all text-body-small text-on-surface-variant">{p.source_note}</div>}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {p.linkedin_url
                    ? <a className="link text-body-small" href={p.linkedin_url} {...ext}>LinkedIn</a>
                    : <a className="link text-body-small" href={linkedInPeopleSearchUrl(company.name, p.name)} {...ext}>Search LinkedIn</a>}
                  {lead.contact_id !== p.id && (
                    <form action={setPrimaryContactAction}>
                      <input type="hidden" name="lead_id" value={lead.id} />
                      <input type="hidden" name="contact_id" value={p.id} />
                      <button className="btn btn-tonal" type="submit">Set as primary</button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <form action={findPeopleAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="lead_id" value={lead.id} />
          <FindPeopleButton disabled={!canFind} />
          {why && <span className="text-body-small text-warning">{why}</span>}
        </form>
        <p className="meta mt-1">Reads the company&apos;s public team/about pages (respects robots.txt). Names are unverified.</p>
      </div>

      <div>
        <h3>Add a person</h3>
        <form action={addPersonAction} className="grid gap-2 sm:grid-cols-4">
          <input type="hidden" name="lead_id" value={lead.id} />
          <input name="name" className="input" placeholder="Name (required)" aria-label="Name" required />
          <input name="title" className="input" placeholder="Title" aria-label="Title" />
          <input name="linkedin_url" className="input" placeholder="LinkedIn URL" aria-label="LinkedIn URL" />
          <button className="btn btn-tonal" type="submit">Add person</button>
        </form>
      </div>
    </section>
  );
}
