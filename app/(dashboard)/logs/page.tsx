import { redirect } from "next/navigation";
import { getCurrentUserId, getCurrentWorkspaceId } from "@/lib/auth";
import { getLogsPage, parseLogsQuery } from "@/lib/logs/data";
import { getWorkspaceWithAccounts } from "@/lib/workspace";
import LogsView from "./logs-view";

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) redirect("/login");

  const params = await searchParams;
  const one = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value ?? null;
  };

  const query = parseLogsQuery({
    page: one("page"),
    status: one("status"),
    instagramAccountId: one("instagramAccountId"),
  });

  const userId = await getCurrentUserId();

  // The account list comes from the layout's cached workspace query rather
  // than the full dashboard aggregation, which this page used to call for
  // nothing but these usernames.
  const [data, membership] = await Promise.all([
    getLogsPage(workspaceId, query),
    userId ? getWorkspaceWithAccounts(userId) : Promise.resolve(null),
  ]);

  return (
    <LogsView
      data={data}
      accounts={membership?.workspace.instagramAccounts ?? []}
      statusFilter={query.status ?? "ALL"}
      selectedAccountId={query.instagramAccountId ?? "all"}
    />
  );
}
