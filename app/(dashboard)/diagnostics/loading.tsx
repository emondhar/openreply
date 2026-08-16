import { PanelSkeleton, Skeleton } from "@/components/skeleton";

export default function DiagnosticsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-9 w-24" />
      </div>
      <PanelSkeleton lines={5} />
      <PanelSkeleton lines={4} />
    </div>
  );
}
