import { redirect } from "next/navigation";
import { getSettingsData } from "@/lib/settings/data";
import { getCurrentWorkspaceContext } from "@/lib/workspace-access";
import { getWorkspaceMembers } from "@/lib/workspace-members";
import SettingsView from "./settings-view";

export default async function SettingsPage() {
  const context = await getCurrentWorkspaceContext();
  if (!context) redirect("/login");

  const [data, members] = await Promise.all([
    getSettingsData(context.workspaceId),
    getWorkspaceMembers(context.workspaceId, context.role),
  ]);

  return <SettingsView initialData={data} initialMembers={members} />;
}
