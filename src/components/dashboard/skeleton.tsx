export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-md bg-fog-50/[0.06] ${className ?? ""}`} />;
}

export function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Loading">
      <Skeleton className="mb-3 h-3 w-24" />
      <Skeleton className="mb-10 h-10 w-72" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <Skeleton className="mt-8 h-72" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
