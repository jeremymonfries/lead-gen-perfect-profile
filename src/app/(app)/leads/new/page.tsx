import { Suspense } from 'react';
import { requireUser } from '@/lib/auth';
import { createLeadAction } from '../actions';
import { LEAD_TYPES, SOURCES, SIGNAL_TYPES, label } from '@/components/format';

function F({ name, children, type = 'text', required, defaultValue }: { name: string; children: string; type?: string; required?: boolean; defaultValue?: string }) {
  return (
    <div>
      <label className="label" htmlFor={name}>{children}{required && ' *'}</label>
      <input id={name} name={name} type={type} required={required} defaultValue={defaultValue} className="input" />
    </div>
  );
}

export default function NewLeadPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <div className="page-header">
        <div>
          <h1>New lead</h1>
          <p className="page-sub">Add a lead by hand. Only the title is required.</p>
        </div>
      </div>
      <Suspense fallback={<FormSkeleton />}>
        <NewLeadForm />
      </Suspense>
    </div>
  );
}

function FormSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading form">
      {Array.from({ length: 4 }, (_, i) => <div key={i} className="panel h-28 animate-pulse bg-surface-container-high" />)}
    </div>
  );
}

async function NewLeadForm() {
  await requireUser();
  return (
      <form action={createLeadAction} className="space-y-8">
        <section>
          <h2 className="section-title">Lead</h2>
          <div className="panel grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-3"><F name="title" required>Title (e.g. “Acme Pty Ltd — new Melbourne office”)</F></div>
          <div>
            <label className="label" htmlFor="lead_type">Lead type</label>
            <select id="lead_type" name="lead_type" className="input">{LEAD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
          </div>
          <div>
            <label className="label" htmlFor="source">Source</label>
            <select id="source" name="source" defaultValue="linkedin" className="input">{SOURCES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
          </div>
          <F name="est_headcount" type="number">Est. headcount</F>
          <F name="est_locations" type="number">Est. locations</F>
          </div>
        </section>
        <section>
          <h2 className="section-title">Company</h2>
          <div className="panel grid gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2"><F name="company_name">Name</F></div>
          <F name="company_domain">Domain</F>
          <F name="company_city">City</F>
          <F name="company_state">State</F>
          </div>
        </section>
        <section>
          <h2 className="section-title">Contact</h2>
          <div className="panel grid gap-3 sm:grid-cols-2">
          <F name="contact_name">Name</F>
          <F name="contact_title">Title</F>
          <F name="contact_email" type="email">Email</F>
          <F name="contact_linkedin_url" type="url">LinkedIn URL</F>
          </div>
        </section>
        <section>
          <h2 className="section-title">Signal</h2>
          <p className="section-desc">Optional.</p>
          <div className="panel grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="signal_type">Type</label>
            <select id="signal_type" name="signal_type" defaultValue="other" className="input">{SIGNAL_TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}</select>
          </div>
          <F name="signal_date" type="date">Published date</F>
          <div className="sm:col-span-2"><F name="signal_summary">Summary</F></div>
          <div className="sm:col-span-2"><F name="signal_url" type="url">Source URL</F></div>
          </div>
        </section>
        <section>
          <h2 className="section-title">Notes</h2>
          <div className="panel">
            <textarea id="notes" name="notes" rows={3} aria-label="Notes" className="input" />
          </div>
        </section>
        <div className="flex justify-end border-t border-outline-variant pt-6">
          <button type="submit" className="btn btn-primary">Create lead</button>
        </div>
      </form>
  );
}
