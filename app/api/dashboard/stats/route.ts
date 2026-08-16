import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId, getCurrentWorkspaceId } from "@/lib/auth";
import { getDashboardStats } from "@/lib/dashboard/stats";

/**
 * The dashboard aggregation over HTTP.
 *
 * The aggregation itself lives in lib/dashboard/stats so server components can
 * call it without a round trip; this endpoint exists for the client-side
 * refetches that remain (switching the account filter). Pages that only need
 * the connected-account list should use /api/instagram/accounts instead — this
 * runs the full analytics sweep.
 */
export async function GET(request: NextRequest) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  // Shares the cached session resolution with getCurrentWorkspaceId above,
  // rather than resolving it a second time.
  const userId = await getCurrentUserId();

  const data = await getDashboardStats(
    workspaceId,
    userId,
    request.nextUrl.searchParams.get("instagramAccountId")
  );

  return NextResponse.json(
    { success: true, data },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
