/**
 * Persisting the set of posts a campaign covers.
 *
 * The picker sends the ids it ticked plus the Graph metadata it already has in
 * memory, so the server can cache thumbnails without a second round trip to
 * Instagram.
 *
 * `postIds` is the MANUAL set only — the posts a human chose. Posts a rule
 * enrolled are not in it and are never removed by a save, because a rule may
 * have added one between the builder loading and the user hitting save; treating
 * the submitted list as authoritative over those would silently drop it.
 * Removing a rule-enrolled post is an explicit act, via `excludePostIds`.
 */

import { z } from "zod";
import type { PrismaClient } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/client";
import { MAX_POSTS_PER_CAMPAIGN, POST_MEDIA_TYPES } from "@/lib/campaigns/post-rules";

export const postMetaSchema = z.object({
  permalink: z.string().max(500).optional().nullable(),
  thumbnailUrl: z.string().max(2000).optional().nullable(),
  mediaUrl: z.string().max(2000).optional().nullable(),
  mediaType: z.enum(POST_MEDIA_TYPES).optional().nullable(),
  caption: z.string().max(4000).optional().nullable(),
  timestamp: z.string().optional().nullable(),
});

export type PostMetaInput = z.infer<typeof postMetaSchema>;

export const postIdsSchema = z
  .array(z.string().min(1).max(200))
  .max(MAX_POSTS_PER_CAMPAIGN);

/** Metadata columns for an AutomationPost row, from what the picker sent. */
function metaColumns(meta: PostMetaInput | undefined) {
  const postedAt = meta?.timestamp ? new Date(meta.timestamp) : null;
  return {
    permalink: meta?.permalink ?? null,
    thumbnailUrl: meta?.thumbnailUrl ?? null,
    mediaUrl: meta?.mediaUrl ?? null,
    mediaType: meta?.mediaType ?? null,
    caption: meta?.caption ?? null,
    postedAt: postedAt && !Number.isNaN(postedAt.getTime()) ? postedAt : null,
  };
}

type Db = PrismaClient | typeof prisma;

export interface SyncCampaignPostsResult {
  /** Every media this campaign now covers. */
  mediaIds: string[];
  added: string[];
  removed: string[];
  /** Mirror values for the legacy Automation.postId / postUrl columns. */
  primary: { postId: string | null; postUrl: string | null };
}

/**
 * Reconcile a campaign's post rows against a submitted manual selection.
 *
 * Rule-enrolled rows survive untouched unless named in `excludePostIds`. A post
 * that was rule-enrolled and is now ticked by hand is promoted to MANUAL — the
 * user pointed at it deliberately, and that is what decides who wins the one
 * private reply Instagram allows per comment.
 */
export async function syncCampaignPosts(params: {
  automationId: string;
  postIds: string[];
  postMeta?: Record<string, PostMetaInput>;
  excludePostIds?: string[];
  db?: Db;
}): Promise<SyncCampaignPostsResult> {
  const {
    automationId,
    postMeta = {},
    excludePostIds = [],
    db = prisma,
  } = params;

  const postIds = [...new Set(params.postIds)].slice(0, MAX_POSTS_PER_CAMPAIGN);
  const wanted = new Set(postIds);
  const excluded = new Set(excludePostIds);

  const existing = await db.automationPost.findMany({
    where: { automationId },
    select: { id: true, mediaId: true, source: true, excluded: true, thumbnailUrl: true },
  });
  const byMedia = new Map(existing.map((row) => [row.mediaId, row]));

  const added: string[] = [];
  const removed: string[] = [];

  // New manual picks.
  const creates = postIds
    .filter((mediaId) => !byMedia.has(mediaId))
    .map((mediaId) => ({
      automationId,
      mediaId,
      source: "MANUAL" as const,
      ...metaColumns(postMeta[mediaId]),
    }));
  if (creates.length > 0) {
    await db.automationPost.createMany({ data: creates, skipDuplicates: true });
    added.push(...creates.map((c) => c.mediaId));
  }

  for (const row of existing) {
    if (excluded.has(row.mediaId)) {
      if (!row.excluded) {
        await db.automationPost.update({
          where: { id: row.id },
          data: { excluded: true },
        });
        removed.push(row.mediaId);
      }
      continue;
    }

    if (wanted.has(row.mediaId)) {
      const meta = postMeta[row.mediaId];
      const promote = row.source !== "MANUAL";
      // Backfill metadata onto rows that predate it (the migration leaves
      // thumbnails null) without clobbering what is already cached.
      const needsMeta = Boolean(meta) && !row.thumbnailUrl;
      if (promote || row.excluded || needsMeta) {
        await db.automationPost.update({
          where: { id: row.id },
          data: {
            source: "MANUAL",
            excluded: false,
            ...(needsMeta ? metaColumns(meta) : {}),
          },
        });
      }
      continue;
    }

    // Not selected any more. A manual row is deleted outright; a rule-enrolled
    // one is left alone — the rule still owns it.
    if (row.source === "MANUAL") {
      await db.automationPost.delete({ where: { id: row.id } });
      removed.push(row.mediaId);
    }
  }

  const remaining = await db.automationPost.findMany({
    where: { automationId, excluded: false },
    select: { mediaId: true, permalink: true },
    orderBy: [{ source: "asc" }, { addedAt: "asc" }],
  });

  return {
    mediaIds: remaining.map((r) => r.mediaId),
    added,
    removed,
    primary: {
      postId: remaining[0]?.mediaId ?? null,
      postUrl: remaining[0]?.permalink ?? null,
    },
  };
}
