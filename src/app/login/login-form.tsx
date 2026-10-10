'use client';

import { useActionState } from 'react';
import { signIn, signUp, type AuthState } from './actions';

export default function LoginForm() {
  const [inState, inAction, inPending] = useActionState<AuthState, FormData>(signIn, undefined);
  const [upState, upAction, upPending] = useActionState<AuthState, FormData>(signUp, undefined);
  const state = upState ?? inState;
  const pending = inPending || upPending;
  return (
    <form className="flex flex-col gap-3">
      <input name="email" type="email" required autoComplete="email" placeholder="Email"
        className="rounded border border-gray-300 px-3 py-2" />
      <input name="password" type="password" required minLength={6} autoComplete="current-password" placeholder="Password"
        className="rounded border border-gray-300 px-3 py-2" />
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.message && <p className="text-sm text-green-700">{state.message}</p>}
      <button formAction={inAction} disabled={pending}
        className="rounded bg-black px-3 py-2 text-white disabled:opacity-50">Sign in</button>
      <button formAction={upAction} disabled={pending}
        className="rounded border border-gray-300 px-3 py-2 disabled:opacity-50">Sign up</button>
    </form>
  );
}
