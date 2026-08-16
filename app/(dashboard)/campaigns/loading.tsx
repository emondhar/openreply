import { Skeleton } from "@/components/skeleton";

export default function CampaignsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <Skeleton className="h-4 w-28" />
        <div className="flex gap-3">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-32" />
        </div>
      </div>

      <Skeleton className="h-9 w-full" />

      {/* Card height matches a populated campaign row so the list does not
          jump when the real cards arrive. */}
      <div className="space-y-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="panel rounded p-4">
            <div className="flex items-start gap-4">
              <Skeleton className="h-12 w-12 shrink-0" />
              <div className="min-w-0 flex-1 space-y-2.5">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-full max-w-md" />
                <Skeleton className="h-3 w-64" />
              </div>
              <Skeleton className="h-6 w-11 shrink-0 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
