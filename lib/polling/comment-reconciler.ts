/**
 * Comment reconciliation (polling safety net).
 *
 * Instagram webhooks are best-effort and never fire for a large class of
 * comments (collapsed "load more" comments, non-follower / low-signal accounts,
 * anything Instagram filters). Those comments are otherwise invisible: never
 * replied to, never DM'd.
 *
 * This sweep is deliberately narrow. It looks only at posts campaigns actually
 * cover, only at recent comments, and acts on a comment ONLY when both are true:
 *   1. the comment matches a covering campaign's keyword, and
 *   2. the account owner has not already replied to it.
 * The reply check reads the comment's actual replies on Instagram, so a comment
 * you (or the tool) already answered is skipped — the poll never re-touches
 * handled comments. Each sweep is capped so it can never flood the comment API
 * (which Instagram rate-limits aggressively, error 368).
 *
 * The sweep runs PER ACCOUNT, not per campaign. That matters now that one
 * campaign can cover many posts: campaigns overlap heavily, so walking each
 * campaign's posts separately would re-fetch the same media's comments once per
 * campaign covering it. Collecting the union of covered media first means each
 * post's comments are fetched exactly once per sweep no matter how many
 * campaigns point at it, and one queue job is enqueued per comment rather than
 * per (campaign, comment) — the worker already tries every matching campaign.
 *
 * It runs on an interval in the worker process because Vercel's free crons only
 * fire once a day. Matching and sending reuse the worker's processComment, so
 * rate limiting and logging behave exactly as for webhook-delivered comments.
 *
 * Known limitation, handled not fixed: comments removed by Instagram's Hidden
 * Words / spam filter may not be returned by the Graph API at all. Disable that
 * filter on the account to widen results.
 */

import { prisma } from "@/lib/db/client";
import { getDMQueue } from "@/lib/queue/client";
import {
  getRecentMediaComments,
  getUserMedia,
  MetaApiError,
  type InstagramComment,
} from "@/lib/meta/client";
import { decryptToken } from "@/lib/meta/oauth";
import { matchKeywords } from "@/lib/utils/keyword-matcher";

// Only consider comments from the last few days — older ones are outside
// Instagram's private-reply window anyway, so a DM to them would just fail.
const LOOKBACK_HOURS = Number(process.env.COMMENT_POLL_LOOKBACK_HOURS ?? 72);
// Hard cap on how many new comments a single account can enqueue per sweep, so
// a viral post drains gradually instead of bursting into the comment API.
const MAX_NEW_PER_SWEEP = Number(process.env.COMMENT_POLL_MAX_PER_SWEEP ?? 30);
// Hard cap on how many distinct posts one account's sweep will read comments
// for. A campaign may cover hundreds; this is the real bound on API calls.
const MAX_MEDIA_PER_SWEEP = Number(process.env.COMMENT_POLL_MAX_MEDIA ?? 40);
// For "any post" campaigns, how many recent posts to scan.
const RECENT_MEDIA_LIMIT = 10;

/** An active campaign, reduced to what matching needs. */
interface SweepCampaign {
  id: string;
  name: string;
  matchAnyPost: boolean;
  matchAnyWord: boolean;
  keywords: string[];
  wholeWordMatch: boolean;
  publicReplyEnabled: boolean;
  workspaceId: string;
}

interface SweepStat {
  account: string;
  mediaScanned: number;
  campaigns: number;
  matched: number;
  alreadyReplied: number;
  enqueued: number;
  perCampaign: Record<string, number>;
  errors: string[];
}

function errMessage(error: unknown): string {
  if (error instanceof MetaApiError) return `Meta ${error.code}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return "Unknown error";
}

/** One reconciliation pass across every account that has active campaigns. */
export async function reconcileComments(): Promise<void> {
  const accounts = await prisma.instagramAccount.findMany({
    where: { automations: { some: { isActive: true } } },
    select: {
      id: true,
      instagramId: true,
      username: true,
      accessToken: true,
      workspaceId: true,
    },
  });

  const sinceMs = Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000;

  for (const account of accounts) {
    const stat = await sweepAccount(account, sinceMs).catch(
      (error): SweepStat => ({
        account: account.username,
        mediaScanned: 0,
        campaigns: 0,
        matched: 0,
        alreadyReplied: 0,
        enqueued: 0,
        perCampaign: {},
        errors: [errMessage(error)],
      })
    );
    await recordSweep(account.workspaceId, stat);
  }
}

/**
 * Every post this account's active campaigns cover, mapped to the campaigns
 * covering it.
 *
 * Posts published outside the lookback window are dropped: their comments are
 * past Instagram's private-reply window, so reading them can only produce sends
 * that fail. That filter is what keeps the cost of a many-post campaign flat —
 * a campaign covering 300 posts still only sweeps the handful still live.
 */
async function collectCoveredMedia(
  campaigns: SweepCampaign[],
  accessToken: string,
  sinceMs: number,
  stat: SweepStat
): Promise<Map<string, SweepCampaign[]>> {
  const byId = new Map(campaigns.map((c) => [c.id, c]));
  const covered = new Map<string, { postedAt: number; campaigns: SweepCampaign[] }>();

  const add = (mediaId: string, postedAt: number, campaign: SweepCampaign) => {
    const entry = covered.get(mediaId);
    if (entry) {
      if (!entry.campaigns.some((c) => c.id === campaign.id)) {
        entry.campaigns.push(campaign);
      }
      entry.postedAt = Math.max(entry.postedAt, postedAt);
      return;
    }
    covered.set(mediaId, { postedAt, campaigns: [campaign] });
  };

  const cutoff = new Date(sinceMs);
  const rows = await prisma.automationPost.findMany({
    where: {
      automationId: { in: campaigns.map((c) => c.id) },
      excluded: false,
      // postedAt is null on rows backfilled from the pre-multi-post schema and
      // on any post enrolled before its metadata was cached. Keep those — a
      // missing timestamp is not evidence the post is old.
      OR: [{ postedAt: null }, { postedAt: { gte: cutoff } }],
    },
    select: { automationId: true, mediaId: true, postedAt: true },
  });

  for (const row of rows) {
    const campaign = byId.get(row.automationId);
    if (campaign) add(row.mediaId, row.postedAt?.getTime() ?? 0, campaign);
  }

  // "Any post" campaigns have no rows of their own — scan the recent feed.
  const anyPost = campaigns.filter((c) => c.matchAnyPost);
  if (anyPost.length > 0) {
    try {
      const media = await getUserMedia(accessToken, RECENT_MEDIA_LIMIT);
      for (const m of media) {
        const postedAt = Date.parse(m.timestamp ?? "");
        for (const campaign of anyPost) {
          add(m.id, Number.isNaN(postedAt) ? 0 : postedAt, campaign);
        }
      }
    } catch (error) {
      stat.errors.push(`Media list: ${errMessage(error)}`);
    }
  }

  // Newest first, then capped — the recent posts are the ones whose comments
  // are still inside the reply window.
  const ordered = [...covered.entries()]
    .sort((a, b) => b[1].postedAt - a[1].postedAt)
    .slice(0, MAX_MEDIA_PER_SWEEP);

  if (covered.size > ordered.length) {
    stat.errors.push(
      `Capped at ${MAX_MEDIA_PER_SWEEP} of ${covered.size} covered posts this sweep`
    );
  }

  return new Map(ordered.map(([mediaId, entry]) => [mediaId, entry.campaigns]));
}

async function sweepAccount(
  account: {
    id: string;
    instagramId: string;
    username: string;
    accessToken: string;
  },
  sinceMs: number
): Promise<SweepStat> {
  const stat: SweepStat = {
    account: account.username,
    mediaScanned: 0,
    campaigns: 0,
    matched: 0,
    alreadyReplied: 0,
    enqueued: 0,
    perCampaign: {},
    errors: [],
  };

  let accessToken: string;
  try {
    accessToken = decryptToken(account.accessToken);
  } catch {
    stat.errors.push("Failed to decrypt access token");
    return stat;
  }

  const campaigns: SweepCampaign[] = await prisma.automation.findMany({
    where: { isActive: true, instagramAccountId: account.id },
    select: {
      id: true,
      name: true,
      matchAnyPost: true,
      matchAnyWord: true,
      keywords: true,
      wholeWordMatch: true,
      publicReplyEnabled: true,
      workspaceId: true,
    },
  });
  stat.campaigns = campaigns.length;
  if (campaigns.length === 0) return stat;

  const covered = await collectCoveredMedia(campaigns, accessToken, sinceMs, stat);
  if (covered.size === 0) return stat;

  const queue = getDMQueue();
  // Comment id -> the comment and the post it is on, for every comment at least
  // one campaign wants. Deduped across campaigns: the worker re-runs every match
  // itself, so one job per comment is enough no matter how many campaigns cover
  // the post. The media id is carried along because the pool spans posts and the
  // job needs to say which one it came from.
  const pending = new Map<string, { comment: InstagramComment; mediaId: string }>();

  for (const [mediaId, covering] of covered) {
    let comments: InstagramComment[];
    try {
      // Once per media, however many campaigns cover it.
      comments = await getRecentMediaComments(accessToken, mediaId, sinceMs);
      stat.mediaScanned += 1;
    } catch (error) {
      stat.errors.push(`Comments ${mediaId}: ${errMessage(error)}`);
      continue;
    }

    // Comments not written by the account itself, and not already answered by
    // the owner. Both checks are per comment, independent of campaign.
    const candidates = comments.filter((c) => {
      const authorId = c.from?.id;
      if (!authorId || authorId === account.instagramId) return false;
      const ownerReplied = (c.replies?.data ?? []).some(
        (r) => r.from?.id === account.instagramId
      );
      if (ownerReplied) {
        stat.alreadyReplied += 1;
        return false;
      }
      return true;
    });
    if (candidates.length === 0) continue;

    // Which comments each covering campaign would act on, by keyword.
    const wanted = new Map<string, InstagramComment[]>();
    for (const campaign of covering) {
      const hits = candidates.filter((c) =>
        campaign.matchAnyWord
          ? true
          : matchKeywords(c.text ?? "", campaign.keywords, campaign.wholeWordMatch)
              .matched
      );
      if (hits.length > 0) {
        wanted.set(campaign.id, hits);
        stat.matched += hits.length;
      }
    }
    if (wanted.size === 0) continue;

    // Second guard against races: skip comments a campaign has already fully
    // handled. "Fully handled" depends on the campaign: if it posts a public
    // reply, the completion signal is publicReplySentAt (a DM alone is not
    // enough — the reply still has to land); otherwise a SENT DM is enough.
    // This is what lets a comment whose DM sent but whose public reply failed
    // come back and retry the reply. One query covers every campaign on this
    // post rather than one per campaign.
    const candidateIds = [...new Set([...wanted.values()].flat().map((c) => c.id))];
    const logs = await prisma.dmLog.findMany({
      where: {
        automationId: { in: [...wanted.keys()] },
        commentId: { in: candidateIds },
      },
      select: {
        automationId: true,
        commentId: true,
        status: true,
        publicReplySentAt: true,
      },
    });
    const logByKey = new Map(logs.map((l) => [`${l.automationId}:${l.commentId}`, l]));

    for (const campaign of covering) {
      const hits = wanted.get(campaign.id);
      if (!hits) continue;
      for (const comment of hits) {
        const log = logByKey.get(`${campaign.id}:${comment.id}`);
        const handled = campaign.publicReplyEnabled
          ? Boolean(log?.publicReplySentAt)
          : log?.status === "SENT";
        if (handled) continue;
        pending.set(comment.id, { comment, mediaId });
        stat.perCampaign[campaign.name] = (stat.perCampaign[campaign.name] ?? 0) + 1;
      }
    }
  }

  // Oldest first, so whoever commented earliest gets answered first, capped.
  const fresh = [...pending.values()]
    .sort((a, b) => Date.parse(a.comment.timestamp) - Date.parse(b.comment.timestamp))
    .slice(0, MAX_NEW_PER_SWEEP);

  for (const { comment: c, mediaId } of fresh) {
    // No deterministic jobId here: a retained completed/failed job from an
    // earlier sweep would otherwise be treated as a duplicate and silently drop
    // this add, so the comment would never be retried. Dedup is handled above
    // (owner-reply + DmLog guards) and the worker is idempotent
    // (publicReplySentAt / SENT), so re-processing a comment is safe.
    await queue.add("process-comment", {
      instagramAccountId: account.instagramId,
      commentId: c.id,
      commentText: c.text ?? "",
      commenterId: c.from!.id,
      commenterName: c.from?.username,
      mediaId,
      source: "POLLING",
    });
    stat.enqueued += 1;
  }

  return stat;
}

async function recordSweep(
  workspaceId: string,
  stat: SweepStat
): Promise<void> {
  // Only log when something happened or something went wrong.
  if (stat.enqueued === 0 && stat.errors.length === 0) return;

  await prisma.operationalEvent
    .create({
      data: {
        workspaceId,
        source: "SYSTEM",
        level: stat.errors.length > 0 ? "WARNING" : "INFO",
        message: `Comment sweep @${stat.account}: ${stat.enqueued} enqueued, ${stat.matched} matched, ${stat.alreadyReplied} already replied, ${stat.mediaScanned} posts scanned across ${stat.campaigns} campaigns`,
        payload: { ...stat },
      },
    })
    .catch(() => {});
}
