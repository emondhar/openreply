import { Skeleton, StatCardsSkeleton } from "@/components/skeleton";

export default function DashboardLoading() {
  return (
    <div className="space-y-8">
      <div>
        <Skeleton className="h-8 w-56" />
        <Skeleton className="mt-2 h-4 w-72" />
      </div>

      <StatCardsSkeleton />

      <div className="grid grid-cols-1 lg:grid-cols-6 gap-4 sm:gap-6">
        <div className="lg:col-span-3 panel rounded p-4 sm:p-6">
          <Skeleton className="h-3.5 w-36" />
          {/* Matches the bar chart's h-40 track so the panel does not resize
              when the real chart replaces it. */}
          <div className="mt-6 flex h-40 items-end gap-1.5 sm:gap-2">
            {["45%", "70%", "30%", "85%", "55%", "40%", "65%"].map(
              (height, i) => (
                <div
                  key={i}
                  className="min-w-0 flex-1 animate-pulse rounded-sm bg-surface-hover"
                  style={{ height }}
                />
              )
            )}
          </div>
        </div>

        <div className="lg:col-span-1 panel rounded p-4 sm:p-6">
          <Skeleton className="h-3.5 w-24" />
          <div className="mt-5 space-y-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 panel rounded p-4 sm:p-6">
          <Skeleton className="h-3.5 w-28" />
          <div className="mt-5 space-y-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-3 w-40" />
                </div>
                <Skeleton className="h-5 w-14" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
