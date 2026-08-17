import {
  AudienceDimension,
  AudienceMetric,
} from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/client";
import { getAllUserMedia, getMediaInsights, PermissionError } from "@/lib/meta/client";
import {
  getAccountMetric,
  getAudienceDemographics,
  getReelPlaybackMetrics,
  type AudienceDimension as ApiDimension,
  type AudienceMetric as ApiMetric,
} from "@/lib/meta/insights";
import { decryptToken } from "@/lib/meta/oauth";

/**
 * The nightly capture.
 *
 * Instagram keeps roughly 30 days of account insights and no history at all
 * for demographics — they are served as a lifetime snapshot over a rolling
 * window. Whatever is not written down here is unrecoverable, which is why
 * this runs before any of it is displayed.
 *
 * Everything degrades independently. An account under 100 followers gets no
 * demographics, a token granted before the insights scope gets none of it, and
 * neither should stop the rest from being recorded.
 */

const DIMENSIONS: Array<[ApiDimension, AudienceDimension]> = [
  ["age", "AGE"],
  ["gender", "GENDER"],
  ["city", "CITY"],
  ["country", "COUNTRY"],
];

const METRICS: Array<[ApiMetric, AudienceMetric]> = [
  ["follower_demographics", "FOLLOWER"],
  ["engaged_audience_demographics", "ENGAGED"],
];

/** Metrics worth a daily row, with the breakdown that makes each useful. */
const ACCOUNT_METRICS = [
  // The growth question: are we reaching people who do not already follow?
  { metric: "reach", breakdown: "follow_type" },
  // Where attention actually goes — reels vs feed vs story.
  { metric: "views", breakdown: "media_product_type" },
  { metric: "total_interactions", breakdown: "media_product_type" },
  { metric: "accounts_engaged", breakdown: undefined },
  { metric: "profile_links_taps", breakdown: "contact_button_type" },
  { metric: "follows_and_unfollows", breakdown: "follow_type" },
] as const;

/** Midnight UTC for the day a capture belongs to. */
function utcDay(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export interface CaptureResult {
  instagramAccountId: string;
  username: string;
  audienceRows: number;
  metricRows: number;
  mediaRows: number;
  /** Populated when the token lacks the insights scope entirely. */
  permissionDenied: boolean;
  notes: string[];
}

export async function captureAccountInsights(account: {
  id: string;
  instagramId: string;
  username: string;
  accessToken: string;
}): Promise<CaptureResult> {
  const result: CaptureResult = {
    instagramAccountId: account.id,
    username: account.username,
    audienceRows: 0,
    metricRows: 0,
    mediaRows: 0,
    permissionDenied: false,
    notes: [],
  };

  let token: string;
  try {
    token = decryptToken(account.accessToken);
  } catch {
    result.notes.push("Access token could not be decrypted; skipped.");
    return result;
  }

  const date = utcDay();

  // ---- demographics -------------------------------------------------------
  for (const [apiMetric, dbMetric] of METRICS) {
    for (const [apiDim, dbDim] of DIMENSIONS) {
      try {
        const buckets = await getAudienceDemographics(token, account.instagramId, {
          metric: apiMetric,
          dimension: apiDim,
          timeframe: "last_30_days",
        });

        if (!buckets) {
          result.notes.push(`${apiMetric}/${apiDim}: no data (needs 100+ audience)`);
          continue;
        }

        for (const b of buckets) {
          await prisma.audienceSnapshot.upsert({
            where: {
              instagramAccountId_date_metric_dimension_bucket: {
                instagramAccountId: account.id,
                date,
                metric: dbMetric,
                dimension: dbDim,
                bucket: b.bucket,
              },
            },
            create: {
              instagramAccountId: account.id,
              date,
              metric: dbMetric,
              dimension: dbDim,
              bucket: b.bucket,
              value: b.value,
            },
            update: { value: b.value },
          });
          result.audienceRows++;
        }
      } catch (err) {
        if (err instanceof PermissionError) {
          result.permissionDenied = true;
          result.notes.push("Token lacks instagram_business_manage_insights.");
          return result;
        }
        throw err;
      }
    }
  }

  // ---- account metrics ----------------------------------------------------
  // Yesterday, not today: Instagram's own note is that data may lag 48 hours,
  // and a same-day window reliably returns a partial figure that then never
  // gets corrected because the row already exists.
  const until = utcDay();
  const since = new Date(until.getTime() - 86_400_000);

  for (const spec of ACCOUNT_METRICS) {
    const { total, buckets } = await getAccountMetric(token, account.instagramId, {
      metric: spec.metric,
      breakdown: spec.breakdown,
      since,
      until,
    });

    const rows: Array<{ breakdown: string; bucket: string; value: number }> = [];
    if (total !== null) rows.push({ breakdown: "", bucket: "", value: total });
    for (const b of buckets) {
      rows.push({ breakdown: spec.breakdown ?? "", bucket: b.bucket, value: b.value });
    }

    for (const row of rows) {
      await prisma.accountMetricSnapshot.upsert({
        where: {
          instagramAccountId_date_metric_breakdown_bucket: {
            instagramAccountId: account.id,
            date: since,
            metric: spec.metric,
            breakdown: row.breakdown,
            bucket: row.bucket,
          },
        },
        create: {
          instagramAccountId: account.id,
          date: since,
          metric: spec.metric,
          breakdown: row.breakdown,
          bucket: row.bucket,
          value: row.value,
        },
        update: { value: row.value },
      });
      result.metricRows++;
    }
  }

  // ---- per-media ----------------------------------------------------------
  // Only recent posts. An old post's numbers no longer move, so re-capturing
  // the whole library nightly would spend hundreds of API calls to write
  // identical rows. Anything published in the last 30 days is still in play.
  const cutoff = Date.now() - 30 * 86_400_000;
  const media = (await getAllUserMedia(token, 100)).filter(
    (m) => new Date(m.timestamp).getTime() >= cutoff
  );

  for (const m of media) {
    const isReel = m.media_product_type === "REELS" || m.media_type === "VIDEO";
    // CAROUSEL_ALBUM returns no insights at all — asking is a guaranteed error.
    if (m.media_type === "CAROUSEL_ALBUM") continue;

    const metrics = isReel
      ? ["views", "reach", "saved", "shares", "total_interactions"]
      : ["views", "reach", "saved", "shares", "total_interactions", "follows", "profile_visits"];

    let ins: Record<string, number> | null = null;
    try {
      ins = (await getMediaInsights(token, m.id, metrics)) as Record<string, number>;
    } catch (err) {
      if (err instanceof PermissionError) {
        result.permissionDenied = true;
        break;
      }
      // A single post refusing its metrics is normal (too new, wrong type).
      ins = null;
    }

    const playback = isReel
      ? await getReelPlaybackMetrics(token, m.id)
      : { avgWatchTimeMs: null, skipRate: null };

    await prisma.mediaMetricSnapshot.create({
      data: {
        instagramAccountId: account.id,
        mediaId: m.id,
        mediaType: m.media_product_type ?? m.media_type,
        permalink: m.permalink ?? null,
        caption: m.caption?.slice(0, 500) ?? null,
        publishedAt: new Date(m.timestamp),
        views: ins?.views ?? null,
        reach: ins?.reach ?? null,
        likes: m.like_count ?? null,
        comments: m.comments_count ?? null,
        saved: ins?.saved ?? null,
        shares: ins?.shares ?? null,
        totalInteractions: ins?.total_interactions ?? null,
        follows: ins?.follows ?? null,
        profileVisits: ins?.profile_visits ?? null,
        avgWatchTimeMs: playback.avgWatchTimeMs,
        skipRate: playback.skipRate,
      },
    });
    result.mediaRows++;
  }

  return result;
}

/** Capture every connected account. Used by the nightly cron. */
export async function captureAllAccounts(): Promise<CaptureResult[]> {
  const accounts = await prisma.instagramAccount.findMany({
    select: { id: true, instagramId: true, username: true, accessToken: true },
  });

  const results: CaptureResult[] = [];
  for (const account of accounts) {
    try {
      results.push(await captureAccountInsights(account));
    } catch (err) {
      results.push({
        instagramAccountId: account.id,
        username: account.username,
        audienceRows: 0,
        metricRows: 0,
        mediaRows: 0,
        permissionDenied: false,
        notes: [err instanceof Error ? err.message : "Unknown capture failure"],
      });
    }
  }
  return results;
}
