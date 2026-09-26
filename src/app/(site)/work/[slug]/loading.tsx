export default function Loading() {
  return (
    <div role="status" aria-label="Loading project" className="container-x pt-[calc(var(--nav-height)+4rem)]">
      <div className="h-3 w-40 animate-pulse rounded bg-fog-50/[0.06]" />
      <div className="mt-8 h-24 w-2/3 animate-pulse rounded-md bg-fog-50/[0.06]" />
      <div className="mt-14 aspect-[16/8] animate-pulse rounded-xl bg-fog-50/[0.04]" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
