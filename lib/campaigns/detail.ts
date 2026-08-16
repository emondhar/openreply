/**
 * One campaign, with the breakdowns the list view doesn't carry.
 *
 * The campaigns list already rolls up totals per campaign. This adds what only
 * makes sense once a campaign covers many posts: which post actually drove the
 * DMs, which keyword fired, and how it moved over time.
 *
 * The detail page previously fetched the entire campaign list and .find()'d one
 * row out of it. That was tolerable when a campaign was a handful of scalars;
 * with a post set and per-post stats attached it is not.
 */

import { cache } from "react";
import { prisma } from "@/lib/db/client";
import { buildReportUrl } from "@/lib/reports/share";
import { calculateCtr, normalizeTopKeywords } from "@/lib/tracking/analytics";
import { buildTrackedUrl } from "@/lib/tracking/message";
import type { Campaign, CampaignPost } from "@/lib/campaigns/data";

/** Days of history in the campaign time series. */
const SERIES_DAYS = 14;

export type CampaignPostStats = CampaignPost & {
  sent: number;
  skipped: number;
  failed: number;
  total: number;
};

export type CampaignDetail = Campaign & {
  postStats: CampaignPostStats[];
  /** DMs attributed to no post — the inbound-DM trigger. */
  unattributed: { sent: number; skipped: number; failed: number; total: number };
  series: { date: string; sent: number; total: number }[];
};

function emptyCounts() {
  return { sent: 0, skipped: 0, failed: 0, total: 0 };
}

function applyStatus(
  bucket: { sent: number; skipped: number; failed: number; total: number },
  status: string,
  count: number
) {
  bucket.total += count;
  if (status === "SENT") bucket.sent += count;
  else if (status === "FAILED") bucket.failed += count;
  else if (status.startsWith("SKIPPED_")) bucket.skipped += count;
}

export const getCampaignDetail = cache(
  async (workspaceId: string, id: string): Promise<CampaignDetail | null> => {
    const automation = await prisma.automation.findFirst({
      where: { id, workspaceId },
      include: {
        instagramAccount: { select: { username: true, instagramId: true } },
        _count: { select: { dmLogs: true } },
        posts: {
          where: { excluded: false },
          select: {
            mediaId: true,
            source: true,
            permalink: true,
            thumbnailUrl: true,
            mediaUrl: true,
            mediaType: true,
            caption: true,
            postedAt: true,
          },
          orderBy: [{ postedAt: "desc" }, { addedAt: "desc" }],
        },
        trackedLinks: {
          select: {
            id: true,
            slug: true,
            label: true,
            destinationUrl: true,
            _count: { select: { clicks: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!automation) return null;

    const seriesStart = new Date();
    seriesStart.setHours(0, 0, 0, 0);
    seriesStart.setDate(seriesStart.getDate() - (SERIES_DAYS - 1));

    const [statusCounts, postCounts, keywordCounts, clicks, seriesRows] =
      await Promise.all([
        prisma.dmLog.groupBy({
          by: ["status"],
          where: { automationId: id },
          _count: { _all: true },
        }),
        // Served by @@index([automationId, postId]).
        prisma.dmLog.groupBy({
          by: ["postId", "status"],
          where: { automationId: id },
          _count: { _all: true },
        }),
        prisma.dmLog.groupBy({
          by: ["matchedKeyword"],
          where: { automationId: id, matchedKeyword: { not: null } },
          _count: { _all: true },
        }),
        prisma.linkClick.count({ where: { automationId: id } }),
        // One bounded read bucketed in JS, rather than a count() per day — the
        // same shape lib/dashboard/stats.ts uses, and it keeps the local
        // midnight boundaries the labels imply.
        prisma.dmLog.findMany({
          where: { automationId: id, createdAt: { gte: seriesStart } },
          select: { createdAt: true, status: true },
        }),
      ]);

    const totals = emptyCounts();
    for (const row of statusCounts) applyStatus(totals, row.status, row._count._all);

    const byPost = new Map<string, ReturnType<typeof emptyCounts>>();
    const unattributed = emptyCounts();
    for (const row of postCounts) {
      if (!row.postId) {
        applyStatus(unattributed, row.status, row._count._all);
        continue;
      }
      let bucket = byPost.get(row.postId);
      if (!bucket) {
        bucket = emptyCounts();
        byPost.set(row.postId, bucket);
      }
      applyStatus(bucket, row.status, row._count._all);
    }

    const postStats: CampaignPostStats[] = automation.posts
      .map((post) => ({
        ...post,
        postedAt: post.postedAt?.toISOString() ?? null,
        ...(byPost.get(post.mediaId) ?? emptyCounts()),
      }))
      // Best performer first — the question this table exists to answer.
      .sort((a, b) => b.sent - a.sent || b.total - a.total);

    const dayBuckets = new Map<string, { sent: number; total: number }>();
    for (const row of seriesRows) {
      const key = new Date(
        row.createdAt.getFullYear(),
        row.createdAt.getMonth(),
        row.createdAt.getDate()
      ).toDateString();
      const bucket = dayBuckets.get(key) ?? { sent: 0, total: 0 };
      bucket.total += 1;
      if (row.status === "SENT") bucket.sent += 1;
      dayBuckets.set(key, bucket);
    }

    const series: CampaignDetail["series"] = [];
    for (let i = 0; i < SERIES_DAYS; i++) {
      const day = new Date(seriesStart);
      day.setDate(day.getDate() + i);
      const bucket = dayBuckets.get(day.toDateString());
      series.push({
        date: day.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        sent: bucket?.sent ?? 0,
        total: bucket?.total ?? 0,
      });
    }

    return {
      ...automation,
      createdAt: automation.createdAt.toISOString(),
      posts: automation.posts.map((post) => ({
        ...post,
        postedAt: post.postedAt?.toISOString() ?? null,
      })),
      trackedLinks: automation.trackedLinks.map((link) => ({
        ...link,
        trackedUrl: buildTrackedUrl(link.slug),
      })),
      reportUrl: automation.reportShareSlug
        ? buildReportUrl(automation.reportShareSlug)
        : null,
      analytics: {
        sent: totals.sent,
        skipped: totals.skipped,
        failed: totals.failed,
        clicks,
        ctr: calculateCtr(clicks, totals.sent),
        topKeywords: normalizeTopKeywords(
          keywordCounts.map((row) => ({
            matchedKeyword: row.matchedKeyword,
            _count: row._count._all,
          })),
          5
        ),
      },
      postStats,
      unattributed,
      series,
    } as CampaignDetail;
  }
);
