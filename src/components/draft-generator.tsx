'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { OutreachDraft } from '@/lib/types';

export function DraftGenerator({ leadId, disabled }: { leadId: string; disabled?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState<null | 'email' | 'linkedin'>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<OutreachDraft | null>(null);
  const [copied, setCopied] = useState(false);

  async function generate(channel: 'email' | 'linkedin') {
    setLoading(channel); setError(null); setDraft(null); setCopied(false);
    try {
      const res = await fetch('/api/drafts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadId, channel }) });
      const json = await res.json();
      if (!res.ok || json.error) setError(json.error ?? `Request failed (${res.status})`);
      else { setDraft(json as OutreachDraft); router.refresh(); }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setLoading(null);
    }
  }

  async function copy() {
    if (!draft) return;
    const text = draft.subject ? `Subject: ${draft.subject}\n\n${draft.body}` : draft.body;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      await fetch('/api/drafts', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ draftId: draft.id, leadId }) });
      router.refresh();
    } catch {
      setError('Could not copy to clipboard');
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" disabled={disabled || !!loading} onClick={() => generate('email')}>{loading === 'email' ? 'Generating…' : 'Generate email draft'}</button>
        <button className="btn" disabled={disabled || !!loading} onClick={() => generate('linkedin')}>{loading === 'linkedin' ? 'Generating…' : 'Generate LinkedIn draft'}</button>
      </div>
      {disabled && <p className="text-body-small text-error">Drafting is disabled: contact is flagged do not contact.</p>}
      {error && <p className="text-body-medium text-error" role="alert">{error}</p>}
      {draft && (
        <div className="rounded-md bg-surface-container-high p-3">
          <div className="mb-1 text-body-small text-on-surface-variant">{draft.channel}{draft.subject ? ` · ${draft.subject}` : ''}</div>
          <pre className="whitespace-pre-wrap font-sans text-body-medium">{draft.body}</pre>
          <button className="btn btn-tonal mt-2" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
        </div>
      )}
    </div>
  );
}
