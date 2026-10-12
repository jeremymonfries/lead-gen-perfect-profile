// Suspense fallback for every per-user page in this group. Pages read auth cookies at request
// time, so only the layout/nav is prerendered; page bodies stream in behind this skeleton.
export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-40 animate-pulse rounded-sm bg-surface-container-high" />
      <div className="h-24 animate-pulse rounded-md bg-surface-container-high" />
      <div className="h-64 animate-pulse rounded-md bg-surface-container-high" />
    </div>
  );
}
