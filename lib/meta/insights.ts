/**
 * Account-level Instagram insights: demographics and broken-down metrics.
 *
 * Kept out of lib/meta/client.ts, which is already the messaging/media surface.
 * Everything here shares one response shape — the `total_value.breakdowns`
 * envelope Instagram uses for any metric requested with `metric_type=total_value`.
 *
 * Verified against the v25 reference. Three constraints shape this whole file:
 *
 *   - Demographics are `period=lifetime` and take a fixed `timeframe` enum.
 *     They reject since/until outright, so the usual date-window helpers do
 *     not apply to them.
 *   - Instagram returns only the top 45 buckets per breakdown, so a long tail
 *     (cities especially) is silently truncated. Totals derived from these are
 *     "top 45" totals, never true totals, and are labelled that way.
 *   - Demographic metrics need 100+ followers (or 100+ engagers) in the window
 *     and return an *empty dataset* rather than zeros when they are not
 *     available. Every function here treats empty as "unavailable", not as 0.
 */

import { getMetaGraphApiVersion } from "@/lib/env";
import { PermissionError } from "@/lib/meta/client";

function base() {
  return `https://graph.instagram.com/${getMetaGraphApiVersion()}`;
}

/** The only timeframes Instagram accepts for demographic metrics. */
export type DemographicsTimeframe =
  | "last_14_days"
  | "last_30_days"
  | "last_90_days"
  | "prev_month"
  | "this_month"
  | "this_week";

/**
 * `follower_demographics` describes who follows the account.
 * `engaged_audience_demographics` describes who actually interacted.
 * The gap between them is the interesting part — see lib/insights/queries.
 */
export type AudienceMetric =
  | "follower_demographics"
  | "engaged_audience_demographics";

export type AudienceDimension = "age" | "gender" | "city" | "country";

export interface BreakdownBucket {
  /** The bucket label exactly as Instagram returns it: "25-34", "F", "US". */
  bucket: string;
  value: number;
}

/** The `total_value.breakdowns` envelope, shared by every metric below. */
interface TotalValueResponse {
  data?: Array<{
    name: string;
    total_value?: {
      value?: number;
      breakdowns?: Array<{
        dimension_keys: string[];
        results: Array<{ dimension_values: string[]; value: number }>;
      }>;
    };
  }>;
}

async function readTotalValue(url: URL): Promise<TotalValueResponse> {
  const response = await fetch(url.toString());
  const body = (await response.json()) as
    | TotalValueResponse
    | { error?: { message?: string; code?: number } };

  if (!response.ok) {
    const err = (body as { error?: { message?: string; code?: number } }).error;
    const message = err?.message ?? `Instagram insights request failed (${response.status})`;
    // 100 and 10 both surface as "you do not have permission" for insights;
    // the caller needs to tell that apart from "this account has no data".
    if (err?.code === 100 || err?.code === 10 || response.status === 403) {
      throw new PermissionError(message);
    }
    throw new Error(message);
  }

  return body as TotalValueResponse;
}

/** Flatten a single-key breakdown into `{ bucket, value }` rows. */
function flatten(body: TotalValueResponse, metric: string): BreakdownBucket[] {
  const entry = body.data?.find((d) => d.name === metric);
  const breakdown = entry?.total_value?.breakdowns?.[0];
  if (!breakdown?.results?.length) return [];

  return breakdown.results
    .map((row) => ({
      bucket: row.dimension_values[0] ?? "unknown",
      value: row.value ?? 0,
    }))
    .filter((row) => row.bucket !== "unknown");
}

/**
 * Demographics for one dimension.
 *
 * Returns `null` when Instagram has no data to give — under 100 followers,
 * under 100 engagers in the window, or an account type that does not report
 * it. That is a normal state, not an error, and is distinct from `[]`.
 */
export async function getAudienceDemographics(
  accessToken: string,
  instagramAccountId: string,
  {
    metric,
    dimension,
    timeframe = "last_30_days",
  }: {
    metric: AudienceMetric;
    dimension: AudienceDimension;
    timeframe?: DemographicsTimeframe;
  }
): Promise<BreakdownBucket[] | null> {
  const url = new URL(`${base()}/${instagramAccountId}/insights`);
  url.searchParams.set("metric", metric);
  url.searchParams.set("period", "lifetime");
  url.searchParams.set("metric_type", "total_value");
  url.searchParams.set("breakdown", dimension);
  url.searchParams.set("timeframe", timeframe);
  url.searchParams.set("access_token", accessToken);

  try {
    const rows = flatten(await readTotalValue(url), metric);
    return rows.length ? rows : null;
  } catch (err) {
    if (err instanceof PermissionError) throw err;
    console.warn(
      `[Instagram] ${metric}/${dimension} unavailable:`,
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

/**
 * A day-period account metric, optionally split by a breakdown.
 *
 * The breakdown is what makes these worth having. `reach` split by
 * `follow_type` answers the only question that matters for growth — is this
 * account reaching people who do not already follow it — and no aggregate
 * total can answer it.
 */
export async function getAccountMetric(
  accessToken: string,
  instagramAccountId: string,
  {
    metric,
    breakdown,
    since,
    until,
  }: {
    metric:
      | "reach"
      | "views"
      | "total_interactions"
      | "accounts_engaged"
      | "likes"
      | "comments"
      | "shares"
      | "saves"
      | "replies"
      | "reposts"
      | "profile_links_taps"
      | "follows_and_unfollows";
    breakdown?:
      | "follow_type"
      | "follower_type"
      | "media_product_type"
      | "contact_button_type";
    since?: Date;
    until?: Date;
  }
): Promise<{ total: number | null; buckets: BreakdownBucket[] }> {
  const url = new URL(`${base()}/${instagramAccountId}/insights`);
  url.searchParams.set("metric", metric);
  url.searchParams.set("period", "day");
  url.searchParams.set("metric_type", "total_value");
  if (breakdown) url.searchParams.set("breakdown", breakdown);
  if (since) url.searchParams.set("since", String(Math.floor(since.getTime() / 1000)));
  if (until) url.searchParams.set("until", String(Math.floor(until.getTime() / 1000)));
  url.searchParams.set("access_token", accessToken);

  try {
    const body = await readTotalValue(url);
    const entry = body.data?.find((d) => d.name === metric);
    return {
      total: entry?.total_value?.value ?? null,
      buckets: flatten(body, metric),
    };
  } catch (err) {
    if (err instanceof PermissionError) throw err;
    console.warn(
      `[Instagram] ${metric}${breakdown ? `/${breakdown}` : ""} unavailable:`,
      err instanceof Error ? err.message : err
    );
    return { total: null, buckets: [] };
  }
}

/**
 * Reels-only playback metrics.
 *
 * `ig_reels_avg_watch_time` is milliseconds. On its own it says little — six
 * seconds is excellent on a 15s reel and poor on a 90s one — so the useful
 * figure is retention, which needs the clip's duration and is computed in
 * lib/insights/queries rather than here.
 *
 * `reels_skip_rate` is documented as in-development and is frequently absent;
 * it is requested separately so its absence cannot take the watch time with it.
 */
export async function getReelPlaybackMetrics(
  accessToken: string,
  mediaId: string
): Promise<{ avgWatchTimeMs: number | null; skipRate: number | null }> {
  async function one(metric: string): Promise<number | null> {
    const url = new URL(`${base()}/${mediaId}/insights`);
    url.searchParams.set("metric", metric);
    url.searchParams.set("access_token", accessToken);
    try {
      const response = await fetch(url.toString());
      if (!response.ok) return null;
      const body = (await response.json()) as {
        data?: Array<{ name: string; values?: Array<{ value: number }> }>;
      };
      return body.data?.find((d) => d.name === metric)?.values?.[0]?.value ?? null;
    } catch {
      return null;
    }
  }

  const [avgWatchTimeMs, skipRate] = await Promise.all([
    one("ig_reels_avg_watch_time"),
    one("reels_skip_rate"),
  ]);

  return { avgWatchTimeMs, skipRate };
}
