'use client';

import { useFormStatus } from 'react-dom';

export function FindPeopleButton({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-tonal" disabled={disabled || pending} aria-busy={pending}>
      {pending ? 'Checking website… up to a minute' : 'Find people on website'}
    </button>
  );
}
