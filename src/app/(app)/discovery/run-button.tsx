'use client';

import { useFormStatus } from 'react-dom';

export function RunButton({ disabled, label, pendingLabel, secondary }: { disabled?: boolean; label: string; pendingLabel: string; secondary?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={secondary ? 'btn btn-tonal' : 'btn btn-primary'} disabled={disabled || pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}
