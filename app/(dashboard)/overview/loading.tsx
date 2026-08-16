import { Skeleton, StatCardsSkeleton } from "@/components/skeleton";

export default function OverviewLoading() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>

      <StatCardsSkeleton />
      <Skeleton className="h-64 w-full" />

      <div className="panel rounded p-4 sm:p-6">
        <Skeleton className="h-3.5 w-16" />
        <div className="mt-5 space-y-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
