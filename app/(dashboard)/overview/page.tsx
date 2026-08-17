"use client";

/**
 * Instagram Overview Page
 *
 * Aggregate reach/engagement across your recent posts, plus a per-post table.
 * Views / reach / saved / shares come from Instagram media insights (requires
 * the insights permission); likes and comments are always available.
 */

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import AccountSelect from "@/components/account-select";
import StatCard from "@/components/stat-card";
import { readCache, writeCache } from "@/lib/client-cache";
import type { OverviewResponse } from "@/app/api/instagram/overview/route";

// Recharts is the largest chunk in the build — around 350 KB — for one line
// chart that many accounts have no history to draw in. Loading it on demand
// keeps it off the critical path for the stat tiles and the post table, which
// are what this page is actually for.
const FollowerChart = dynamic(() => import("@/components/follower-chart"), {
  ssr: false,
  loading: () => <div className="panel rounded h-64 animate-pulse" />,
});

// Instagram's insights API is slow even with server-side caching in front of
// it, so a revisit paints the last response immediately and refreshes behind
// it — the same stale-while-revalidate the inbox and the post picker use.
const CACHE_MAX_AGE_MS = 5 * 60 * 1000;
const overviewCacheKey = (accountId: string, count: string) =>
  `overview:${accountId}:${count}`;

function formatNumber(n: number | null): string {
  if (n === null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const COUNT_OPTIONS = [
  { value: "25", label: "Last 25" },
  { value: "50", label: "Last 50" },
  { value: "100", label: "Last 100" },
  { value: "all", label: "All time" },
];

export default function OverviewPage() {
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState("all");
  const [count, setCount] = useState("50");

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (selectedAccountId !== "all") {
      params.set("instagramAccountId", selectedAccountId);
    }
    params.set("count", count);

    // Paint the cached response first so a revisit — or a return from another
    // tab — is not a blank skeleton while Instagram is queried again.
    const cacheKey = overviewCacheKey(selectedAccountId, count);
    const cached = readCache<OverviewResponse>(cacheKey, CACHE_MAX_AGE_MS);
    /* eslint-disable react-hooks/set-state-in-effect */
    if (cached.data) {
      setData(cached.data);
      setLoading(false);
    } else {
      setLoading(true);
    }
    /* eslint-enable react-hooks/set-state-in-effect */

    fetch(`/api/instagram/overview?${params}`)
      .then((r) => r.json())
      .then((res) => {
        if (cancelled) return;
        if (res.success) {
          setData(res.data);
          writeCache(cacheKey, res.data);
          setError(null);
        } else if (!cached.data) {
          setError(res.error ?? "Failed to load overview");
        }
      })
      .catch(() => {
        if (!cancelled && !cached.data) setError("Failed to load overview");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedAccountId, count]);

  function handleAccountChange(accountId: string) {
    setSelectedAccountId(accountId);
  }

  function handleCountChange(next: string) {
    setCount(next);
  }

  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="panel rounded p-4 h-24 sm:p-5">
            <div className="h-4 w-16 rounded bg-surface-hover" />
            <div className="mt-3 h-6 w-20 rounded bg-surface-hover/60" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="panel rounded p-8 text-center">
        <p className="text-sm text-error">{error}</p>
        {error.includes("connect") && (
          <a
            href="/api/instagram/connect"
            className="mt-4 inline-block text-sm text-accent-strong hover:underline"
          >
            Connect Instagram
          </a>
        )}
      </div>
    );
  }

  if (!data) return null;

  const { totals, posts, accounts, insightsAvailable, followers, followerHistory } =
    data;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-foreground">Overview</h1>
          <p className="text-sm text-muted mt-1">
            {data.requestedCount === "all" ? "All-time" : "Recent"} —{" "}
            {totals.posts} post{totals.posts === 1 ? "" : "s"} from @
            {data.account.username}
            {data.truncated ? ` (capped at ${totals.posts})` : ""}
          </p>
          {followers !== null && (
            // Kept out of the tile row below: that row sums the selected posts,
            // whereas this is a current account-level total.
            <p className="mt-1 text-sm text-muted">
              {followers.toLocaleString()} followers
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <label className="flex flex-col gap-2 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              Range
            </span>
            <select
              value={count}
              onChange={(e) => handleCountChange(e.target.value)}
              className="border-0 bg-transparent py-2 pr-1 text-sm text-foreground outline-none"
            >
              {COUNT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          {accounts.length > 1 && (
            <AccountSelect
              accounts={accounts.map((a) => ({
                id: a.id,
                username: a.username,
                instagramId: a.id,
              }))}
              value={selectedAccountId}
              onChange={handleAccountChange}
            />
          )}
        </div>
      </div>

      {!insightsAvailable && (
        <div className="panel rounded p-4 border border-border">
          <p className="text-sm text-foreground">
            Views, reach, saved and shares need the insights permission.
          </p>
          <p className="text-sm text-muted mt-1">
            Reconnect your account to grant it — likes and comments are shown in
            the meantime.
          </p>
          <a
            href="/api/instagram/connect"
            className="mt-3 inline-block text-sm text-accent-strong hover:underline"
          >
            Reconnect Instagram
          </a>
        </div>
      )}

      {/* Aggregate totals */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <StatCard label="Views" value={formatNumber(totals.views)} />
        <StatCard label="Reach" value={formatNumber(totals.reach)} />
        <StatCard label="Likes" value={formatNumber(totals.likes)} />
        <StatCard label="Comments" value={formatNumber(totals.comments)} />
        <StatCard label="Saved" value={formatNumber(totals.saved)} />
        <StatCard label="Shares" value={formatNumber(totals.shares)} />
      </div>

      {/* Follower trend — account-level, independent of the post range. Only
          mounted when there is history to draw, so accounts with no snapshots
          never download the charting library at all. */}
      {followerHistory.length > 0 && (
        <FollowerChart data={followerHistory} followers={followers} />
      )}

      {/* Per-post table */}
      <div className="panel rounded p-4 sm:p-6">
        <h2 className="text-sm font-semibold text-foreground mb-4">Posts</h2>
        {posts.length === 0 ? (
          <p className="text-sm text-muted py-8 text-center">No posts found</p>
        ) : (
          // Eight metric columns can't compress into a phone; let the table keep
          // its natural width and scroll inside the panel instead.
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted border-b border-border">
                  <th className="py-2 pr-4 font-medium">Post</th>
                  <th className="py-2 px-3 font-medium text-right">Views</th>
                  <th className="py-2 px-3 font-medium text-right">Reach</th>
                  <th className="py-2 px-3 font-medium text-right">Likes</th>
                  <th className="py-2 px-3 font-medium text-right">Comments</th>
                  <th className="py-2 px-3 font-medium text-right">Saved</th>
                  <th className="py-2 px-3 font-medium text-right">Shares</th>
                  <th className="py-2 pl-3 font-medium text-right">Date</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-border last:border-0"
                  >
                    <td className="py-3 pr-4 max-w-xs">
                      {p.permalink ? (
                        <a
                          href={p.permalink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-foreground hover:text-accent-strong truncate block"
                        >
                          {p.caption || `${p.mediaType} post`}
                        </a>
                      ) : (
                        <span className="text-foreground truncate block">
                          {p.caption || `${p.mediaType} post`}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right text-muted">
                      {formatNumber(p.views)}
                    </td>
                    <td className="py-3 px-3 text-right text-muted">
                      {formatNumber(p.reach)}
                    </td>
                    <td className="py-3 px-3 text-right text-muted">
                      {formatNumber(p.likes)}
                    </td>
                    <td className="py-3 px-3 text-right text-muted">
                      {formatNumber(p.comments)}
                    </td>
                    <td className="py-3 px-3 text-right text-muted">
                      {formatNumber(p.saved)}
                    </td>
                    <td className="py-3 px-3 text-right text-muted">
                      {formatNumber(p.shares)}
                    </td>
                    <td className="py-3 pl-3 text-right text-muted">
                      {formatDate(p.timestamp)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
