import { NextRequest, NextResponse } from "next/server";
import { captureAllAccounts } from "@/lib/insights/capture";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Demographics are four dimensions x two metrics per account, plus per-media
// insights for anything published in the last 30 days. On a busy account that
// is a few hundred sequential Meta calls.
export const maxDuration = 300;

/**
 * Nightly insight capture.
 *
 * Runs after the follower snapshot so a day's rows land together. Instagram
 * keeps no demographic history at all, so a night missed here is a gap that
 * cannot be backfilled later.
 */
export async function GET(request: NextRequest) {
  // Same contract as the other cron routes: always authenticated, falling back
  // to NEXTAUTH_SECRET so an instance that never set CRON_SECRET is still
  // closed rather than silently open to the internet.
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET || process.env.NEXTAUTH_SECRET;

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const results = await captureAllAccounts();

  return NextResponse.json({
    success: true,
    data: {
      accounts: results.length,
      audienceRows: results.reduce((n, r) => n + r.audienceRows, 0),
      metricRows: results.reduce((n, r) => n + r.metricRows, 0),
      mediaRows: results.reduce((n, r) => n + r.mediaRows, 0),
      results,
    },
  });
}
