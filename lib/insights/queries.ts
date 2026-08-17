import { cache } from "react";
import type {
  AudienceDimension,
  AudienceMetric,
} from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/client";

/**
 * The analyses worth having.
 *
 * Instagram only gives aggregate totals, so nothing here is a metric it
 * serves — each one is two or more of its aggregates put beside each other so
 * they answer a question a single total cannot. The four that matter:
 *
 *   audienceMismatch   who follows you vs who actually engages
 *   reachSplit         did this reach new people or the same people again
 *   reelRetention      how much of a clip is watched, normalised by length
 *   contentFunnel      reach → interaction → profile visit → follow, per post
 *
 * All of them read from snapshots rather than the API, so they are fast, work
 * offline, and can look further back than Instagram's own 30-day window.
 */

/** Share of a whole, with the count that produced it. */
export interface Share {
  bucket: string;
  value: number;
  /** 0–100, as a share of the buckets Instagram returned. */
  pct: number;
}

function toShares(rows: Array<{ bucket: string; value: number }>): Share[] {
  const total = rows.reduce((n, r) => n + r.value, 0);
  if (!total) return [];
  return rows
    .map((r) => ({ bucket: r.bucket, value: r.value, pct: (r.value / total) * 100 }))
    .sort((a, b) => b.value - a.value);
}

async function latestDemographics(
  instagramAccountId: string,
  metric: AudienceMetric,
  dimension: AudienceDimension
): Promise<Share[]> {
  const latest = await prisma.audienceSnapshot.findFirst({
    where: { instagramAccountId, metric, dimension },
    orderBy: { date: "desc" },
    select: { date: true },
  });
  if (!latest) return [];

  const rows = await prisma.audienceSnapshot.findMany({
    where: { instagramAccountId, metric, dimension, date: latest.date },
    select: { bucket: true, value: true },
  });
  return toShares(rows);
}

export interface MismatchRow {
  bucket: string;
  /** Share of followers in this bucket, 0–100. */
  followerPct: number;
  /** Share of engagers in this bucket, 0–100. */
  engagedPct: number;
  /**
   * engagedPct − followerPct. Positive means this group engages harder than
   * its size suggests; negative means they follow but do not respond.
   */
  delta: number;
}

/**
 * Who follows you against who actually engages, per bucket.
 *
 * This is the single most useful thing available from Instagram's aggregates
 * and no dashboard shows it, because it needs two separate metrics requested
 * with the same breakdown and then normalised — neither is meaningful raw.
 *
 * A large positive delta is an audience you are under-serving: they respond
 * out of proportion to their number, so more content aimed at them is the
 * cheapest growth available. A large negative delta is a group that followed
 * for something you have stopped making.
 */
export const getAudienceMismatch = cache(
  async (
    instagramAccountId: string,
    dimension: AudienceDimension
  ): Promise<MismatchRow[]> => {
    const [followers, engaged] = await Promise.all([
      latestDemographics(instagramAccountId, "FOLLOWER", dimension),
      latestDemographics(instagramAccountId, "ENGAGED", dimension),
    ]);
    if (!followers.length || !engaged.length) return [];

    const engagedBy = new Map(engaged.map((e) => [e.bucket, e.pct]));
    const buckets = new Set([
      ...followers.map((f) => f.bucket),
      ...engaged.map((e) => e.bucket),
    ]);

    return [...buckets]
      .map((bucket) => {
        const followerPct = followers.find((f) => f.bucket === bucket)?.pct ?? 0;
        const engagedPct = engagedBy.get(bucket) ?? 0;
        return { bucket, followerPct, engagedPct, delta: engagedPct - followerPct };
      })
      .sort((a, b) => b.delta - a.delta);
  }
);

export interface ReachSplitPoint {
  date: string;
  follower: number;
  nonFollower: number;
  total: number;
  /** Share of reach that was NOT already following, 0–100. */
  newAudiencePct: number;
}

/**
 * Daily reach split into people who already follow and people who do not.
 *
 * The growth question. A total reach figure cannot distinguish an account
 * showing the same 5,000 people every post from one finding 5,000 new people,
 * and those are opposite situations with opposite fixes.
 */
export const getReachSplit = cache(
  async (instagramAccountId: string, days = 30): Promise<ReachSplitPoint[]> => {
    const since = new Date(Date.now() - days * 86_400_000);
    const rows = await prisma.accountMetricSnapshot.findMany({
      where: {
        instagramAccountId,
        metric: "reach",
        breakdown: "follow_type",
        date: { gte: since },
      },
      orderBy: { date: "asc" },
      select: { date: true, bucket: true, value: true },
    });

    const byDate = new Map<string, { follower: number; nonFollower: number }>();
    for (const r of rows) {
      const key = r.date.toISOString().slice(0, 10);
      const entry = byDate.get(key) ?? { follower: 0, nonFollower: 0 };
      // Instagram spells this "follower" / "non_follower"; be forgiving about
      // casing and separators in case that changes under us.
      if (/non/i.test(r.bucket)) entry.nonFollower += r.value;
      else entry.follower += r.value;
      byDate.set(key, entry);
    }

    return [...byDate.entries()].map(([date, v]) => {
      const total = v.follower + v.nonFollower;
      return {
        date,
        follower: v.follower,
        nonFollower: v.nonFollower,
        total,
        newAudiencePct: total ? (v.nonFollower / total) * 100 : 0,
      };
    });
  }
);

export interface ReelRetention {
  mediaId: string;
  permalink: string | null;
  caption: string | null;
  publishedAt: string | null;
  views: number | null;
  reach: number | null;
  avgWatchTimeMs: number | null;
  /**
   * avgWatchTime ÷ clip duration, 0–100. Null when the duration is unknown.
   * Six seconds is excellent on a 15s reel and poor on a 90s one, which is why
   * the raw watch time on its own says almost nothing.
   */
  retentionPct: number | null;
  skipRate: number | null;
}

/**
 * Reel retention, normalised by clip length.
 *
 * `durationsMs` is passed in rather than fetched because Instagram does not
 * return a duration on the insights endpoint — it comes off the media object,
 * which the caller already has.
 */
export const getReelRetention = cache(
  async (
    instagramAccountId: string,
    durationsMs: Record<string, number> = {},
    limit = 25
  ): Promise<ReelRetention[]> => {
    // The most recent capture per media, so a post appears once rather than
    // once per night it was snapshotted.
    const rows = await prisma.mediaMetricSnapshot.findMany({
      where: { instagramAccountId, avgWatchTimeMs: { not: null } },
      orderBy: { capturedAt: "desc" },
      take: limit * 8,
    });

    const seen = new Set<string>();
    const out: ReelRetention[] = [];
    for (const r of rows) {
      if (seen.has(r.mediaId)) continue;
      seen.add(r.mediaId);

      const duration = durationsMs[r.mediaId];
      out.push({
        mediaId: r.mediaId,
        permalink: r.permalink,
        caption: r.caption,
        publishedAt: r.publishedAt?.toISOString() ?? null,
        views: r.views,
        reach: r.reach,
        avgWatchTimeMs: r.avgWatchTimeMs,
        retentionPct:
          duration && r.avgWatchTimeMs
            ? Math.min((r.avgWatchTimeMs / duration) * 100, 100)
            : null,
        skipRate: r.skipRate,
      });
      if (out.length >= limit) break;
    }
    return out;
  }
);

export interface FunnelRow {
  mediaId: string;
  permalink: string | null;
  caption: string | null;
  publishedAt: string | null;
  reach: number | null;
  interactions: number | null;
  profileVisits: number | null;
  follows: number | null;
  /** interactions ÷ reach, 0–100 — how compelling it was to those who saw it. */
  engagementRate: number | null;
  /** follows ÷ reach, 0–100 — how much of that turned into an audience. */
  conversionRate: number | null;
  /** DMs this post's campaigns actually sent, from the app's own logs. */
  dmsSent: number;
  /** Tracked-link clicks attributed to those DMs. */
  clicks: number;
}

/**
 * Reach → interaction → profile visit → follow, per post, joined to the DM
 * automation the app already records.
 *
 * The join is the point. Instagram can tell you a post reached 50,000 people;
 * only this app knows that 300 of them commented a keyword, 280 got a DM and
 * 90 clicked the link. Nothing else can put those next to each other, and it
 * turns "which post performed" into "which post earned anything".
 */
export const getContentFunnel = cache(
  async (instagramAccountId: string, limit = 25): Promise<FunnelRow[]> => {
    const snapshots = await prisma.mediaMetricSnapshot.findMany({
      where: { instagramAccountId },
      orderBy: { capturedAt: "desc" },
      take: limit * 8,
    });

    const latest = new Map<string, (typeof snapshots)[number]>();
    for (const s of snapshots) if (!latest.has(s.mediaId)) latest.set(s.mediaId, s);

    const mediaIds = [...latest.keys()].slice(0, limit);
    if (!mediaIds.length) return [];

    // The automation side, grouped in the database rather than per post.
    const [dmRows, clickRows] = await Promise.all([
      prisma.dmLog.groupBy({
        by: ["automationId"],
        where: { instagramAccountId, status: "SENT" },
        _count: { _all: true },
      }),
      prisma.linkClick.groupBy({
        by: ["automationId"],
        where: { instagramAccountId },
        _count: { _all: true },
      }),
    ]);

    // automationId → the media it targets.
    const automations = await prisma.automation.findMany({
      where: { instagramAccountId },
      select: { id: true, postId: true, posts: { select: { mediaId: true } } },
    });

    const dmByMedia = new Map<string, number>();
    const clicksByMedia = new Map<string, number>();
    const dmByAutomation = new Map(dmRows.map((r) => [r.automationId, r._count._all]));
    const clicksByAutomation = new Map(
      clickRows.map((r) => [r.automationId, r._count._all])
    );

    for (const a of automations) {
      const targets = new Set<string>(a.posts.map((p) => p.mediaId));
      if (a.postId) targets.add(a.postId);
      for (const mediaId of targets) {
        dmByMedia.set(mediaId, (dmByMedia.get(mediaId) ?? 0) + (dmByAutomation.get(a.id) ?? 0));
        clicksByMedia.set(
          mediaId,
          (clicksByMedia.get(mediaId) ?? 0) + (clicksByAutomation.get(a.id) ?? 0)
        );
      }
    }

    return mediaIds.map((mediaId) => {
      const s = latest.get(mediaId)!;
      const reach = s.reach ?? null;
      return {
        mediaId,
        permalink: s.permalink,
        caption: s.caption,
        publishedAt: s.publishedAt?.toISOString() ?? null,
        reach,
        interactions: s.totalInteractions,
        profileVisits: s.profileVisits,
        follows: s.follows,
        engagementRate:
          reach && s.totalInteractions != null ? (s.totalInteractions / reach) * 100 : null,
        conversionRate: reach && s.follows != null ? (s.follows / reach) * 100 : null,
        dmsSent: dmByMedia.get(mediaId) ?? 0,
        clicks: clicksByMedia.get(mediaId) ?? 0,
      };
    });
  }
);

/** Whether there is enough captured history for the analyses to mean anything. */
export const getInsightCoverage = cache(async (instagramAccountId: string) => {
  const [audience, metrics, media] = await Promise.all([
    prisma.audienceSnapshot.aggregate({
      where: { instagramAccountId },
      _count: { _all: true },
      _min: { date: true },
      _max: { date: true },
    }),
    prisma.accountMetricSnapshot.aggregate({
      where: { instagramAccountId },
      _count: { _all: true },
      _min: { date: true },
      _max: { date: true },
    }),
    prisma.mediaMetricSnapshot.aggregate({
      where: { instagramAccountId },
      _count: { _all: true },
      _min: { capturedAt: true },
    }),
  ]);

  return {
    audienceRows: audience._count._all,
    audienceFrom: audience._min.date?.toISOString().slice(0, 10) ?? null,
    audienceTo: audience._max.date?.toISOString().slice(0, 10) ?? null,
    metricRows: metrics._count._all,
    metricFrom: metrics._min.date?.toISOString().slice(0, 10) ?? null,
    metricTo: metrics._max.date?.toISOString().slice(0, 10) ?? null,
    mediaRows: media._count._all,
    capturingSince: media._min.capturedAt?.toISOString().slice(0, 10) ?? null,
  };
});
