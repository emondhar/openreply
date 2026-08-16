import { redirect } from "next/navigation";
import { getCurrentUserId, getCurrentWorkspaceId } from "@/lib/auth";
import { getDashboardStats } from "@/lib/dashboard/stats";
import DashboardView from "./dashboard-view";

export default async function DashboardPage() {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) redirect("/login");

  // Both helpers share one cached session resolution, and the query runs while
  // the browser is still downloading this route's JavaScript rather than after
  // it has hydrated.
  const userId = await getCurrentUserId();
  const stats = await getDashboardStats(workspaceId, userId);

  return <DashboardView initialStats={stats} />;
}
