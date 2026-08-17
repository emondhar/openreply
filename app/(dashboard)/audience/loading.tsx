import { PanelSkeleton, Skeleton } from "@/components/skeleton";

export default function AudienceLoading() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-2 h-4 w-48" />
      </div>
      <PanelSkeleton lines={6} />
      <PanelSkeleton lines={5} />
      <PanelSkeleton lines={5} />
      <PanelSkeleton lines={6} />
    </div>
  );
}
