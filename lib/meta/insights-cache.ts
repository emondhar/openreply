import { unstable_cache } from "next/cache";
import {
  getMediaInsights,
  PermissionError,
  type InstagramMediaInsights,
} from "@/lib/meta/client";

/**
 * Cached per-media insight lookups.
 *
 * The overview page asks Instagram for insights on every post it displays —
 * up to 500 requests for a single page view, repeated in full whenever the
 * account or post-count selector changes. Almost all of that is re-fetching
 * numbers that no longer move.
 *
 * Two TTLs, because two kinds of post: a reel published this morning is still
 * accumulating views, while one from last month is effectively frozen. Age is
 * the only signal needed to tell them apart.
 *
 * Uses unstable_cache rather than the `use cache` directive because that
 * directive requires the cacheComponents flag, which changes default rendering
 * semantics across the whole app. When this project adopts Cache Components,
 * this file becomes a `use cache` function with cacheLife/cacheTag.
 */

const FRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const FRESH_TTL_SECONDS = 60 * 60; // 1h  — still accumulating
const SETTLED_TTL_SECONDS = 24 * 60 * 60; // 24h — effectively final

/** Tag for every insight entry belonging to one connected account. */
export function insightsTag(instagramAccountId: string): string {
  return `ig-insights:${instagramAccountId}`;
}

export async function getCachedMediaInsights({
  accessToken,
  instagramAccountId,
  mediaId,
  metrics,
  publishedAt,
}: {
  accessToken: string;
  instagramAccountId: string;
  mediaId: string;
  metrics: string[];
  publishedAt: string;
}): Promise<InstagramMediaInsights | null> {
  const age = Date.now() - new Date(publishedAt).getTime();
  const revalidate =
    Number.isFinite(age) && age < FRESH_WINDOW_MS
      ? FRESH_TTL_SECONDS
      : SETTLED_TTL_SECONDS;

  // The access token is deliberately a closure rather than a key part: it
  // rotates on refresh, and keying on it would throw away every cached entry
  // each time that happens. The media id already identifies the data.
  const load = unstable_cache(
    async () => {
      try {
        return await getMediaInsights(accessToken, mediaId, metrics);
      } catch (err) {
        // A permission failure is a property of the token's scopes, not of
        // this media, and it applies to every post. Caching it would pin the
        // whole account to "no insights" until the TTL expired, long after a
        // reconnect had granted the scope — so it is rethrown for the caller
        // to handle and nothing is written to the cache.
        if (err instanceof PermissionError) throw err;
        return null;
      }
    },
    ["ig-insights", mediaId, metrics.join(",")],
    { revalidate, tags: [insightsTag(instagramAccountId)] }
  );

  // PermissionError propagates so the caller can report insightsAvailable:
  // false for the whole account. A rejected call is not written to the cache.
  return load();
}
