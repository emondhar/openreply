import { PanelSkeleton } from "@/components/skeleton";

export default function SettingsLoading() {
  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <PanelSkeleton lines={4} />
      <PanelSkeleton lines={3} />
      <PanelSkeleton lines={2} />
      <PanelSkeleton lines={1} />
    </div>
  );
}
