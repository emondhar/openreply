import { redirect } from "next/navigation";
import { getCurrentUserId, getCurrentWorkspaceId } from "@/lib/auth";
import { getCampaigns } from "@/lib/campaigns/data";
import { getWorkspaceWithAccounts } from "@/lib/workspace";
import CampaignsView from "./campaigns-view";

export default async function CampaignsPage() {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) redirect("/login");

  const userId = await getCurrentUserId();

  // The account list comes from the layout's cached workspace query. This page
  // used to call the full dashboard aggregation for it.
  const [campaigns, membership] = await Promise.all([
    getCampaigns(workspaceId),
    userId ? getWorkspaceWithAccounts(userId) : Promise.resolve(null),
  ]);

  return (
    <CampaignsView
      initialCampaigns={campaigns}
      accounts={membership?.workspace.instagramAccounts ?? []}
    />
  );
}
