import { Skeleton } from "@/components/skeleton";

export default function LogsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {[52, 44, 48, 56, 62, 58, 54].map((width, i) => (
          <Skeleton key={i} className="h-7" style={{ width }} />
        ))}
      </div>

      <div className="panel rounded overflow-hidden">
        <div className="border-b border-border px-4 py-4 sm:px-6">
          <Skeleton className="h-3 w-full max-w-md" />
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="px-4 py-4 sm:px-6">
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
