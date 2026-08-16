import { Skeleton } from "@/components/skeleton";

export default function InboxLoading() {
  return (
    // Mirrors the inbox's two-pane layout, so the conversation list and thread
    // land in the columns their placeholders already occupy.
    <div className="grid h-[calc(100dvh-9rem)] grid-cols-1 gap-4 lg:grid-cols-[20rem_1fr]">
      <div className="panel rounded p-3 space-y-3">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 py-2">
            <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3 w-36" />
            </div>
          </div>
        ))}
      </div>
      <div className="panel rounded hidden lg:block" />
    </div>
  );
}
