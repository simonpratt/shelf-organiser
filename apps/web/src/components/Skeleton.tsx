// Loading placeholder rows for a list, announced as "Loading…".
export function Skeleton({ rows = 3, label = "Loading…" }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-2">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} aria-hidden="true" className="h-16 animate-pulse rounded-md bg-surface" />
      ))}
    </div>
  );
}
