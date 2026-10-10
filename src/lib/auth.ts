import 'server-only';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function requireUser(): Promise<{ id: string; email: string | null }> {
  // Per-user pages must render at request time (Supabase reads the clock and cookies).
  await connection();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect('/login');
  return { id: data.user.id, email: data.user.email ?? null };
}
