// Suspense fallback for every per-user page in this group. Pages read auth cookies at request
// time, so only the layout/nav is prerendered; page bodies stream in behind this skeleton.
export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div className="h-7 w-40 animate-pulse rounded bg-gray-200" />
      <div className="h-24 animate-pulse rounded bg-gray-100" />
      <div className="h-64 animate-pulse rounded bg-gray-100" />
    </div>
  );
}
