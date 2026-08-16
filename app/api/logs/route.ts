import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { getLogsPage, parseLogsQuery } from "@/lib/logs/data";

/**
 * One page of DM logs over HTTP. The query lives in lib/logs/data so the logs
 * page can render it on the server without a round trip; this remains for
 * external/API consumers.
 */
export async function GET(request: NextRequest) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const data = await getLogsPage(
    workspaceId,
    parseLogsQuery({
      page: searchParams.get("page"),
      limit: searchParams.get("limit"),
      status: searchParams.get("status"),
      instagramAccountId: searchParams.get("instagramAccountId"),
    })
  );

  return NextResponse.json(
    { success: true, data },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
