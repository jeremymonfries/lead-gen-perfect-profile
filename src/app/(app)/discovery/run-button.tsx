'use client';

import { useFormStatus } from 'react-dom';

export function RunButton({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={disabled || pending}>
      {pending ? 'Running… this takes about a minute' : 'Run discovery now'}
    </button>
  );
}
