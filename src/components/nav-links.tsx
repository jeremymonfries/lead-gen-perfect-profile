'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/leads', label: 'Leads' },
  { href: '/leads/new', label: 'New lead' },
  { href: '/discovery', label: 'Discovery' },
  { href: '/reports', label: 'Report' },
  { href: '/settings', label: 'Settings' },
];

// Prerendered shell (no current-route highlight) shown until the pathname is available.
export function NavLinksStatic() {
  return (
    <>
      {LINKS.map((l) => <Link key={l.href} href={l.href} className="tab">{l.label}</Link>)}
    </>
  );
}

// Longest matching destination wins, so /leads/new highlights "New lead" and /leads/123 highlights "Leads".
export function NavLinks() {
  const pathname = usePathname();
  const active = LINKS.filter((l) => pathname === l.href || pathname.startsWith(l.href + '/'))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <>
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} className="tab" aria-current={l.href === active ? 'page' : undefined}>
          {l.label}
        </Link>
      ))}
    </>
  );
}
