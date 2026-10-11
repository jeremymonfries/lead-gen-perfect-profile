import 'server-only';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// [table, stable ordering columns for paging]
const TABLES: Array<[string, string[]]> = [
  ['companies', ['id']], ['contacts', ['id']], ['leads', ['id']], ['signals', ['id']],
  ['lead_signals', ['lead_id', 'signal_id']], ['activities', ['id']], ['outreach_drafts', ['id']],
  ['settings', ['owner_id']], ['discovery_runs', ['id']], ['discovery_candidates', ['id']], ['llm_usage', ['id']],
];
const PAGE = 1000;

function latestMigration(): string | null {
  try {
    const files = readdirSync(join(process.cwd(), 'supabase', 'migrations')).filter((f) => f.endsWith('.sql')).sort();
    return files.length ? files[files.length - 1] : null;
  } catch {
    return null;
  }
}

export async function GET() {
  // Per-user, request-time data: never cache.
  await connection();
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const tables: Record<string, unknown[]> = {};
  for (const [table, order] of TABLES) {
    const rows: unknown[] = [];
    for (let from = 0; ; from += PAGE) {
      let q = supabase.from(table).select('*');
      for (const col of order) q = q.order(col, { ascending: true });
      const { data, error } = await q.range(from, from + PAGE - 1);
      if (error) return NextResponse.json({ error: `Backup failed on ${table}: ${error.message}` }, { status: 500 });
      rows.push(...(data ?? []));
      if (!data || data.length < PAGE) break;
    }
    tables[table] = rows;
  }

  const now = new Date();
  const body = { app: 'perfect-profile-prospecting', exported_at: now.toISOString(), schema_migrations_hint: latestMigration(), tables };
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="perfect-profile-backup-${now.toISOString().slice(0, 10)}.json"`,
      'Cache-Control': 'no-store',
    },
  });
}
