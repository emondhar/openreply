import { NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { getCampaignDetail } from "@/lib/campaigns/detail";

// Read-your-writes, same as the list route: a campaign reopened straight after
// a save must show what was just written.
export const dynamic = "force-dynamic";

/**
 * One campaign with its per-post, per-keyword and time-series breakdowns.
 *
 * The detail page used to pull the whole campaign list and pick one row out of
 * it. That does not scale once every campaign carries a post set.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { id } = await params;
  const data = await getCampaignDetail(workspaceId, id);

  if (!data) {
    return NextResponse.json(
      { success: false, error: "Campaign not found" },
      { status: 404 }
    );
  }

  return NextResponse.json(
    { success: true, data },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
