import { redirect } from "next/navigation";
import { getCurrentUserId, getCurrentWorkspaceId } from "@/lib/auth";
import {
  getAudienceMismatch,
  getContentFunnel,
  getInsightCoverage,
  getReachSplit,
  getReelRetention,
} from "@/lib/insights/queries";
import { getWorkspaceWithAccounts } from "@/lib/workspace";
import AudienceView from "./audience-view";

export default async function AudiencePage() {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) redirect("/login");

  const userId = await getCurrentUserId();
  const membership = userId ? await getWorkspaceWithAccounts(userId) : null;
  const account = membership?.workspace.instagramAccounts[0];

  if (!account) {
    return (
      <div className="panel rounded-xl p-8 text-center">
        <h1 className="b-display text-xl">No account connected</h1>
        <p className="mx-auto mt-3 max-w-(--measure) text-sm leading-6 text-muted">
          Connect an Instagram professional account to start capturing audience
          and content insight.
        </p>
        <a href="/api/instagram/connect" className="b-pill b-pill--filled mt-6">
          Connect Instagram
        </a>
      </div>
    );
  }

  // All six queries in parallel, on the server. Each is cached per request, so
  // the shared account lookup inside them resolves once.
  const [age, gender, country, city, reach, reels, funnel, coverage] =
    await Promise.all([
      getAudienceMismatch(account.id, "AGE"),
      getAudienceMismatch(account.id, "GENDER"),
      getAudienceMismatch(account.id, "COUNTRY"),
      getAudienceMismatch(account.id, "CITY"),
      getReachSplit(account.id, 30),
      getReelRetention(account.id, {}, 15),
      getContentFunnel(account.id, 20),
      getInsightCoverage(account.id),
    ]);

  return (
    <AudienceView
      username={account.username}
      mismatch={{ AGE: age, GENDER: gender, COUNTRY: country, CITY: city }}
      reach={reach}
      reels={reels}
      funnel={funnel}
      coverage={{
        audienceRows: coverage.audienceRows,
        audienceTo: coverage.audienceTo,
        metricRows: coverage.metricRows,
        capturingSince: coverage.capturingSince,
      }}
    />
  );
}
