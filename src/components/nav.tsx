import Link from 'next/link';
import { Suspense } from 'react';
import { NavLinks, NavLinksStatic } from './nav-links';

// M3 top app bar (surface-container) with primary-tab style navigation destinations.
export function Nav() {
  return (
    <header className="bg-surface-container text-on-surface">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 px-4 lg:flex-nowrap">
        <Link href="/leads" className="min-w-0 flex-1 py-3 text-title-medium sm:text-title-large lg:flex-none">Perfect Profile Prospecting</Link>
        <form action="/auth/signout" method="post" className="shrink-0 lg:order-last">
          <button type="submit" className="btn btn-text">Sign out</button>
        </form>
        <nav className="no-scrollbar -mx-4 flex w-[calc(100%+2rem)] overflow-x-auto px-2 lg:mx-0 lg:min-w-0 lg:flex-1 lg:px-0 lg:w-auto">
          <Suspense fallback={<NavLinksStatic />}>
            <NavLinks />
          </Suspense>
        </nav>
      </div>
    </header>
  );
}
