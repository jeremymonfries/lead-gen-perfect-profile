const TRACKING = /^(utm_.*|fbclid|gclid|mc_cid|mc_eid)$/i;

/** Dedupe key: host + path + sorted non-tracking params, no protocol/www/hash. */
export function normalizeUrl(url: string): string {
  const raw = url.trim();
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return raw.toLowerCase();
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const params = [...u.searchParams.entries()].filter(([k]) => !TRACKING.test(k)).sort(([a, av], [b, bv]) => (a === b ? av.localeCompare(bv) : a.localeCompare(b)));
  const path = u.pathname.replace(/\/+$/, '');
  const qs = params.length ? `?${params.map(([k, v]) => `${k}=${v}`).join('&')}` : '';
  return `${host}${path}${qs}`;
}

export function cleanDomain(d: string | null | undefined): string | null {
  if (!d) return null;
  const out = d.trim().toLowerCase().replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0].trim();
  return out || null;
}
