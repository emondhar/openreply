import { NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { getDiagnostics } from "@/lib/ops/diagnostics";

export const runtime = "nodejs";

/**
 * Diagnostics over HTTP, for the screen's manual refresh button. The first
 * paint is server-rendered from lib/ops/diagnostics directly.
 */
export async function GET() {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const data = await getDiagnostics(workspaceId);

  return NextResponse.json(
    { success: true, data },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
