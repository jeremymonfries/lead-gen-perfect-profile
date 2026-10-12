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
      <input name="email" type="email" required autoComplete="email" placeholder="Email" aria-label="Email"
        className="input" />
      <input name="password" type="password" required minLength={6} autoComplete="current-password" placeholder="Password" aria-label="Password"
        className="input" />
      {state?.error && <p className="banner banner-error" role="alert">{state.error}</p>}
      {state?.message && <p className="banner banner-success" role="status">{state.message}</p>}
      <button formAction={inAction} disabled={pending} className="btn btn-primary">Sign in</button>
      <button formAction={upAction} disabled={pending} className="btn">Sign up</button>
    </form>
  );
}
