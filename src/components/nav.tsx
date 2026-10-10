import Link from 'next/link';

export function Nav() {
  return (
    <header className="border-b border-[var(--line)] bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-5 gap-y-1 px-4 py-2">
        <Link href="/leads" className="font-semibold">Perfect Profile Prospecting</Link>
        <nav className="flex flex-1 flex-wrap items-center gap-4 text-sm">
          <Link href="/leads" className="link">Leads</Link>
          <Link href="/leads/new" className="link">New lead</Link>
          <Link href="/settings" className="link">Settings</Link>
        </nav>
        <form action="/auth/signout" method="post">
          <button type="submit" className="text-sm text-gray-600 hover:underline">Sign out</button>
        </form>
      </div>
    </header>
  );
}
