import { cache } from "react";
import { prisma } from "@/lib/db/client";
import { buildReportUrl } from "@/lib/reports/share";
import { calculateCtr, normalizeTopKeywords } from "@/lib/tracking/analytics";
import { buildTrackedUrl } from "@/lib/tracking/message";

export type CampaignAnalytics = {
  sent: number;
  skipped: number;
  failed: number;
  clicks: number;
  ctr: number;
  topKeywords: { keyword: string; count: number }[];
};

export type CampaignPost = {
  mediaId: string;
  source: "MANUAL" | "RULE" | "NEXT_REEL";
  permalink: string | null;
  thumbnailUrl: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
  caption: string | null;
  postedAt: string | null;
};

export type Campaign = {
  id: string;
  name: string;
  goal: string | null;
  /** Legacy mirror of the primary post. Prefer `posts`. */
  postId: string | null;
  postUrl: string | null;
  posts: CampaignPost[];
  postRule: unknown;
  pendingNextReel: boolean;
  matchAnyPost: boolean;
  keywords: string[];
  matchAnyWord: boolean;
  dmMessage: string;
  openingDmEnabled: boolean;
  openingDmMessage: string | null;
  openingDmButtonLabel: string | null;
  publicReplyEnabled: boolean;
  publicReplyMessage: string | null;
  publicReplyMessages: string[];
  requireFollow: boolean;
  followPromptMessage: string | null;
  followPromptButtonLabel: string | null;
  isActive: boolean;
  wholeWordMatch: boolean;
  instagramAccountId: string;
  instagramAccount: { username: string; instagramId: string };
  reportShareSlug: string | null;
  reportShareEnabled: boolean;
  reportUrl: string | null;
  createdAt: string;
  _count: { dmLogs: number };
  trackedLinks: Array<{
    id: string;
    slug: string;
    label: string | null;
    destinationUrl: string;
    trackedUrl: string;
    _count: { clicks: number };
  }>;
  analytics: CampaignAnalytics;
};

/**
 * Every campaign in the workspace with its rolled-up analytics.
 *
 * Shared by the campaigns page (server component) and GET /api/automations, so
 * the list the page renders and the list the client refetches after a mutation
 * are produced by the same code.
 *
 * The three groupBy calls carry the same account filter as the list itself —
 * without it, filtering by account narrowed the campaigns shown while leaving
 * their numbers summed across every account in the workspace.
 */
export const getCampaigns = cache(
  async (
    workspaceId: string,
    instagramAccountId?: string | null
  ): Promise<Campaign[]> => {
    const accountFilter =
      instagramAccountId && instagramAccountId !== "all"
        ? { instagramAccountId }
        : {};

    const [automations, statusCounts, clickCounts, keywordCounts] =
      await Promise.all([
        prisma.automation.findMany({
          where: { workspaceId, ...accountFilter },
          include: {
            instagramAccount: {
              select: { username: true, instagramId: true },
            },
            _count: { select: { dmLogs: true } },
            // Metadata is cached on the row, so the list renders thumbnails
            // without downloading the account's media library per account —
            // which also meant a post outside the most recent page rendered
            // nothing at all.
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
          orderBy: { createdAt: "desc" },
        }),
        prisma.dmLog.groupBy({
          by: ["automationId", "status"],
          where: { workspaceId, ...accountFilter },
          _count: { _all: true },
        }),
        prisma.linkClick.groupBy({
          by: ["automationId"],
          where: { workspaceId, ...accountFilter },
          _count: { _all: true },
        }),
        prisma.dmLog.groupBy({
          by: ["automationId", "matchedKeyword"],
          where: {
            workspaceId,
            matchedKeyword: { not: null },
            ...accountFilter,
          },
          _count: { _all: true },
        }),
      ]);

    const analytics = new Map<
      string,
      Omit<CampaignAnalytics, "ctr"> & { topKeywords: { keyword: string; count: number }[] }
    >();

    for (const automation of automations) {
      analytics.set(automation.id, {
        sent: 0,
        skipped: 0,
        failed: 0,
        clicks: 0,
        topKeywords: [],
      });
    }

    for (const row of statusCounts) {
      const item = analytics.get(row.automationId);
      if (!item) continue;
      const count = row._count._all;
      if (row.status === "SENT") item.sent += count;
      if (row.status === "FAILED") item.failed += count;
      if (row.status.startsWith("SKIPPED_")) item.skipped += count;
    }

    for (const row of clickCounts) {
      const item = analytics.get(row.automationId);
      if (item) item.clicks = row._count._all;
    }

    // Bucket keyword rows by campaign once rather than re-filtering the whole
    // array for every campaign, which was quadratic in the number of rows.
    const keywordsByAutomation = new Map<
      string,
      { matchedKeyword: string | null; _count: number }[]
    >();
    for (const row of keywordCounts) {
      const list = keywordsByAutomation.get(row.automationId) ?? [];
      list.push({ matchedKeyword: row.matchedKeyword, _count: row._count._all });
      keywordsByAutomation.set(row.automationId, list);
    }

    for (const automation of automations) {
      const item = analytics.get(automation.id);
      if (!item) continue;
      item.topKeywords = normalizeTopKeywords(
        keywordsByAutomation.get(automation.id) ?? [],
        3
      );
    }

    return automations.map((automation) => {
      const item = analytics.get(automation.id) ?? {
        sent: 0,
        skipped: 0,
        failed: 0,
        clicks: 0,
        topKeywords: [],
      };

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
          ...item,
          ctr: calculateCtr(item.clicks, item.sent),
        },
      } as Campaign;
    });
  }
);
