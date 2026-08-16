/**
 * Rule-driven post enrollment.
 *
 * A campaign with a saved rule keeps picking up posts as they are published.
 * That happens on two paths, both landing in the same AutomationPost rows:
 *
 *   1. Just-in-time (enrollNewMedia) — the worker calls this the first time it
 *      ever sees a media id. A reel that goes off in its first minute gets its
 *      campaign attached before the first comment is processed, with no waiting
 *      for a sweep. Guarded by a Redis SETNX so it costs one Graph call per new
 *      media ever, not one per comment.
 *
 *   2. Periodic (syncPostRules) — runs on an interval in the worker. Catches
 *      posts that never received a comment, so the campaign's post list in the
 *      UI is right even with zero traffic, and repairs anything the JIT path
 *      missed (worker restart, Redis flush).
 *
 * Enrollment only ever inserts. A post removed by hand keeps an `excluded` row
 * so the next sweep doesn't put it straight back.
 */

import { Prisma, type PrismaClient } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/client";
import { getRedisConnection } from "@/lib/queue/client";
import {
  classifyMediaType,
  matchesPostRule,
  parsePostRule,
  selectPostsByRule,
  type PostRule,
  type RuleTargetPost,
} from "@/lib/campaigns/post-rules";
import { findOverlaps, notifyOverlaps } from "@/lib/campaigns/overlap";
import {
  getAllUserMedia,
  getUserMedia,
  type InstagramMedia,
} from "@/lib/meta/client";
import { decryptToken } from "@/lib/meta/oauth";

/** How long a media id stays marked as "already evaluated for enrollment". */
const SEEN_MEDIA_TTL_SECONDS = 7 * 24 * 60 * 60;
/** How far back the periodic sweep looks for newly matching posts. */
const SYNC_MEDIA_LIMIT = Number(process.env.RULE_SYNC_MEDIA_LIMIT ?? 100);

type PostMetaFields = {
  permalink: string | null;
  thumbnailUrl: string | null;
  mediaUrl: string | null;
  mediaType: string;
  caption: string | null;
  postedAt: Date | null;
};

/** The cached-metadata half of an AutomationPost row, from a Graph media object. */
export function postMetaFromMedia(media: InstagramMedia): PostMetaFields {
  const postedAt = media.timestamp ? new Date(media.timestamp) : null;
  return {
    permalink: media.permalink ?? null,
    thumbnailUrl: media.thumbnail_url ?? media.media_url ?? null,
    mediaUrl: media.media_url ?? null,
    mediaType: classifyMediaType(media),
    caption: media.caption ?? null,
    postedAt: postedAt && !Number.isNaN(postedAt.getTime()) ? postedAt : null,
  };
}

type Db = PrismaClient | typeof prisma;

interface RuleCampaign {
  id: string;
  name: string;
  workspaceId: string;
  instagramAccountId: string;
  postRule: PostRule;
}

/** Active campaigns on an account that carry a usable rule. */
async function loadRuleCampaigns(
  instagramAccountId: string,
  db: Db = prisma
): Promise<RuleCampaign[]> {
  const rows = await db.automation.findMany({
    where: {
      isActive: true,
      instagramAccountId,
      postRule: { not: Prisma.DbNull },
    },
    select: {
      id: true,
      name: true,
      workspaceId: true,
      instagramAccountId: true,
      postRule: true,
    },
  });

  return rows.flatMap((row) => {
    const postRule = parsePostRule(row.postRule);
    return postRule ? [{ ...row, postRule }] : [];
  });
}

/**
 * Insert enrollment rows, skipping posts the campaign already holds (including
 * ones explicitly excluded), then alert on any overlap they create.
 */
async function enroll(
  campaign: RuleCampaign,
  media: InstagramMedia[],
  db: Db = prisma
): Promise<number> {
  if (media.length === 0) return 0;

  const existing = await db.automationPost.findMany({
    where: { automationId: campaign.id },
    select: { mediaId: true },
  });
  const held = new Set(existing.map((r) => r.mediaId));

  const room = campaign.postRule.maxPosts - held.size;
  if (room <= 0) return 0;

  const fresh = media.filter((m) => !held.has(m.id)).slice(0, room);
  if (fresh.length === 0) return 0;

  const result = await db.automationPost.createMany({
    data: fresh.map((m) => ({
      automationId: campaign.id,
      mediaId: m.id,
      source: "RULE" as const,
      ...postMetaFromMedia(m),
    })),
    skipDuplicates: true,
  });

  if (result.count > 0) {
    const overlaps = await findOverlaps({
      instagramAccountId: campaign.instagramAccountId,
      automationId: campaign.id,
      mediaIds: fresh.map((m) => m.id),
    });
    await notifyOverlaps({
      workspaceId: campaign.workspaceId,
      automationId: campaign.id,
      campaignName: campaign.name,
      overlaps,
      trigger: "rule",
    });
  }

  return result.count;
}

/**
 * Enroll a single freshly-seen media into every rule campaign it matches.
 *
 * Called from the comment path, so it is on the critical path of a DM going
 * out: it returns early and silently on anything unexpected rather than
 * failing the job. The Redis mark means the Graph call happens once per media.
 */
export async function enrollNewMedia(params: {
  instagramAccountId: string;
  mediaId: string;
  /**
   * Resolved only on a media's first sighting. Lazy because this runs on every
   * comment job, and loading + decrypting the account token for the ~always
   * case of "already seen" would be a wasted query per comment.
   */
  getAccessToken: () => Promise<string | null>;
  db?: Db;
}): Promise<boolean> {
  const { instagramAccountId, mediaId, getAccessToken, db = prisma } = params;

  try {
    const redis = getRedisConnection();
    const marked = await redis.set(
      `enroll:${instagramAccountId}:${mediaId}`,
      "1",
      "EX",
      SEEN_MEDIA_TTL_SECONDS,
      "NX"
    );
    // Already evaluated — nothing to do. This is the overwhelmingly common case.
    if (marked !== "OK") return false;

    const campaigns = await loadRuleCampaigns(instagramAccountId, db);
    if (campaigns.length === 0) return false;

    const accessToken = await getAccessToken();
    if (!accessToken) return false;

    // One page is enough: this only fires for a media we just received a
    // comment on, which is by definition recent.
    const recent = await getUserMedia(accessToken, 25);
    const media = recent.find((m) => m.id === mediaId);
    if (!media) return false;

    let enrolled = 0;
    for (const campaign of campaigns) {
      if (!matchesPostRule(media, campaign.postRule)) continue;
      enrolled += await enroll(campaign, [media], db);
    }
    return enrolled > 0;
  } catch (error) {
    console.error(`[Enrollment] JIT enrollment failed for ${mediaId}:`, error);
    return false;
  }
}

/**
 * Refresh cached Graph metadata for posts this account's campaigns cover.
 *
 * Instagram's CDN URLs are signed and expire, so a thumbnail cached at
 * selection time goes stale. Since the sweep has already paid for the media
 * list, rewriting the rows it covers is nearly free and keeps the campaign
 * lists rendering. Posts older than the fetched window still go stale; the
 * client-side live fetch is what covers those.
 */
async function refreshPostMetadata(
  instagramAccountId: string,
  media: InstagramMedia[],
  db: Db = prisma
): Promise<number> {
  if (media.length === 0) return 0;

  const rows = await db.automationPost.findMany({
    where: {
      mediaId: { in: media.map((m) => m.id) },
      automation: { instagramAccountId },
    },
    select: { id: true, mediaId: true },
  });
  if (rows.length === 0) return 0;

  const byId = new Map(media.map((m) => [m.id, m]));
  let updated = 0;
  for (const row of rows) {
    const m = byId.get(row.mediaId);
    if (!m) continue;
    await db.automationPost.update({
      where: { id: row.id },
      data: postMetaFromMedia(m),
    });
    updated += 1;
  }
  return updated;
}

export interface RuleSyncStat {
  instagramAccountId: string;
  campaigns: number;
  enrolled: number;
  refreshed: number;
  errors: string[];
}

/**
 * One periodic pass over every account that has rule-driven campaigns.
 *
 * The media list is fetched once per account and evaluated against every rule
 * on it — not once per campaign, which is what would make this expensive.
 */
export async function syncPostRules(db: Db = prisma): Promise<RuleSyncStat[]> {
  const accounts = await db.instagramAccount.findMany({
    where: {
      automations: { some: { isActive: true, postRule: { not: Prisma.DbNull } } },
    },
    select: { id: true, accessToken: true },
  });

  const stats: RuleSyncStat[] = [];

  for (const account of accounts) {
    const stat: RuleSyncStat = {
      instagramAccountId: account.id,
      campaigns: 0,
      enrolled: 0,
      refreshed: 0,
      errors: [],
    };

    try {
      let accessToken: string;
      try {
        accessToken = decryptToken(account.accessToken);
      } catch {
        stat.errors.push("Failed to decrypt access token");
        stats.push(stat);
        continue;
      }

      const campaigns = await loadRuleCampaigns(account.id, db);
      stat.campaigns = campaigns.length;
      if (campaigns.length === 0) {
        stats.push(stat);
        continue;
      }

      // Fetched once, reused by every rule on this account.
      const media = await getAllUserMedia(accessToken, SYNC_MEDIA_LIMIT);

      for (const campaign of campaigns) {
        const matched = selectPostsByRule(
          media as RuleTargetPost[],
          campaign.postRule
        ) as InstagramMedia[];
        stat.enrolled += await enroll(campaign, matched, db);
      }

      stat.refreshed = await refreshPostMetadata(account.id, media, db);
    } catch (error) {
      stat.errors.push(error instanceof Error ? error.message : "Unknown error");
    }

    stats.push(stat);
  }

  return stats;
}
