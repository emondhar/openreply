/**
 * Loading placeholders.
 *
 * These are server components on purpose: they render in route-level
 * loading.tsx files, which Next streams the instant a navigation starts —
 * before the target route's JavaScript has downloaded. That is the whole
 * point of them. Anything with "use client" here would arrive too late to be
 * the thing that fills the gap.
 *
 * The shapes deliberately mirror the real layout they stand in for, so
 * nothing reflows when the data lands.
 *
 * The global reduced-motion rule in globals.css already flattens the pulse,
 * so no per-component guard is needed.
 */

export function Skeleton({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`animate-pulse rounded bg-surface-hover ${className}`}
      style={style}
    />
  );
}

export function StatCardsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="panel rounded p-4 sm:p-5">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="mt-3 h-6 w-20" />
        </div>
      ))}
    </div>
  );
}

export function PanelSkeleton({
  className = "",
  lines = 4,
}: {
  className?: string;
  lines?: number;
}) {
  return (
    <div className={`panel rounded p-4 sm:p-6 ${className}`}>
      <Skeleton className="h-3.5 w-32" />
      <div className="mt-5 space-y-3">
        {Array.from({ length: lines }, (_, i) => (
          <Skeleton key={i} className="h-4 w-full" />
        ))}
      </div>
    </div>
  );
}
