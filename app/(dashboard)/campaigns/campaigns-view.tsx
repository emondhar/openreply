"use client";

/**
 * Campaigns List Page
 *
 * Shows all campaigns as cards with toggle and delete.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AccountSelect, { type AccountOption } from "@/components/account-select";
import Checkbox from "@/components/checkbox";
import { readCache, writeCache } from "@/lib/client-cache";
import type { Campaign } from "@/lib/campaigns/data";

export default function CampaignsView({
  initialCampaigns,
  accounts,
}: {
  initialCampaigns: Campaign[];
  accounts: AccountOption[];
}) {
  const router = useRouter();
  const [automations, setAutomations] = useState<Campaign[]>(initialCampaigns);
  const [selectedAccountId, setSelectedAccountId] = useState("all");
  const [refreshing, setRefreshing] = useState(false);
  // postId -> current thumbnail URL, fetched live (Instagram URLs expire, so
  // they are never stored on the campaign).
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  // postId -> video URL for reels, so a campaign thumbnail can play on click.
  const [videos, setVideos] = useState<Record<string, string>>({});
  // The reel currently playing in the lightbox (null when closed).
  const [playingVideo, setPlayingVideo] = useState<{
    url: string;
    postUrl: string | null;
  } | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "paused">(
    "all"
  );
  // Campaigns checked for a bulk action.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const fetchAutomations = useCallback(
    async (accountId: string) => {
      setRefreshing(true);
      try {
        const params = new URLSearchParams();
        if (accountId !== "all") {
          params.set("instagramAccountId", accountId);
        }
        const res = await fetch(
          `/api/automations${params.size ? `?${params}` : ""}`,
          { cache: "no-store" }
        );
        const data = await res.json();
        if (data.success) setAutomations(data.data);
      } catch (err) {
        console.error("Failed to fetch campaigns:", err);
      } finally {
        setRefreshing(false);
      }
    },
    []
  );

  // Thumbnails cached on the campaign's post rows. Instagram's CDN URLs are
  // signed and expire, so these are a FALLBACK, not a replacement for the live
  // fetch below: they cover posts outside the recent page the live fetch
  // returns, which previously rendered nothing at all. The live URL always wins
  // where both exist.
  const storedThumbnails = useMemo(() => {
    const map: Record<string, string> = {};
    for (const auto of automations) {
      for (const post of auto.posts ?? []) {
        const url = post.thumbnailUrl ?? post.mediaUrl;
        if (url) map[post.mediaId] = url;
      }
    }
    return map;
  }, [automations]);

  const thumbFor = useCallback(
    (mediaId: string) => thumbnails[mediaId] ?? storedThumbnails[mediaId],
    [thumbnails, storedThumbnails]
  );

  // The thumbnail effect keys off the set of accounts in view, not the
  // campaigns array. It used to depend on `automations` directly, so every
  // toggle, delete and duplicate — each of which replaces that array —
  // re-downloaded 50 posts per connected account. The accounts in view do not
  // change when a switch is flipped.
  const accountIdsKey = useMemo(
    () =>
      Array.from(new Set(automations.map((a) => a.instagramAccountId)))
        .sort()
        .join(","),
    [automations]
  );

  // Fetch fresh post thumbnails (and reel video URLs) for the accounts in view
  // and map them by postId. Cache-first so they show instantly on a return
  // visit. Instagram URLs expire, so they are never stored on the campaign.
  useEffect(() => {
    if (!accountIdsKey) return;
    let cancelled = false;
    const accountIds = accountIdsKey.split(",");
    const cacheKey = `ig-media:${accountIdsKey}`;

    const cached = readCache<{
      thumbs: Record<string, string>;
      videos: Record<string, string>;
    }>(cacheKey, 15 * 60 * 1000);
    // Hydrating state from cache is a legitimate effect use here.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (cached.data) {
      setThumbnails(cached.data.thumbs);
      setVideos(cached.data.videos);
    }
    /* eslint-enable react-hooks/set-state-in-effect */

    Promise.all(
      accountIds.map((accountId) =>
        fetch(`/api/instagram/posts?instagramAccountId=${accountId}&limit=50`)
          .then((res) => res.json())
          .then((payload) =>
            payload.success
              ? (payload.data as {
                  id: string;
                  media_type?: string;
                  media_url?: string;
                  thumbnail_url?: string;
                }[])
              : []
          )
          .catch(() => [])
      )
    ).then((lists) => {
      if (cancelled) return;
      const thumbs: Record<string, string> = {};
      const vids: Record<string, string> = {};
      for (const list of lists) {
        for (const media of list) {
          const url = media.thumbnail_url ?? media.media_url;
          if (url) thumbs[media.id] = url;
          if (media.media_type === "VIDEO" && media.media_url) {
            vids[media.id] = media.media_url;
          }
        }
      }
      setThumbnails(thumbs);
      setVideos(vids);
      writeCache(cacheKey, { thumbs, videos: vids });
    });

    return () => {
      cancelled = true;
    };
  }, [accountIdsKey]);

  // Close the reel lightbox on Escape.
  useEffect(() => {
    if (!playingVideo) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPlayingVideo(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playingVideo]);

  function handleAccountChange(accountId: string) {
    setSelectedAccountId(accountId);
    void fetchAutomations(accountId);
  }

  async function toggleActive(id: string, isActive: boolean) {
    try {
      await fetch(`/api/automations?id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !isActive }),
      });
      setAutomations((prev) =>
        prev.map((a) => (a.id === id ? { ...a, isActive: !isActive } : a))
      );
    } catch (err) {
      console.error("Failed to toggle:", err);
    }
  }

  async function copyReelUrl(auto: Campaign) {
    setMenuOpenId(null);
    if (!auto.postUrl) return;
    try {
      await navigator.clipboard.writeText(auto.postUrl);
      setCopiedId(auto.id);
      window.setTimeout(
        () => setCopiedId((cur) => (cur === auto.id ? null : cur)),
        1500
      );
    } catch (err) {
      console.error("Failed to copy reel URL:", err);
    }
  }

  async function deleteAutomation(id: string) {
    if (!confirm("Delete this campaign? This cannot be undone.")) return;
    try {
      await fetch(`/api/automations?id=${id}`, { method: "DELETE" });
      setAutomations((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      console.error("Failed to delete:", err);
    }
  }

  async function duplicateAutomation(auto: Campaign) {
    setMenuOpenId(null);
    const specific = !auto.matchAnyPost && !auto.pendingNextReel;
    try {
      const res = await fetch("/api/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${auto.name} copy`,
          instagramAccountId: auto.instagramAccountId,
          // Carry the whole post set, not just the primary — and its cached
          // metadata, so the copy renders thumbnails immediately. The rule is
          // deliberately not copied: two campaigns auto-enrolling the same posts
          // is the overlap that costs one of them its DMs.
          postIds: specific ? (auto.posts ?? []).map((p) => p.mediaId) : [],
          postMeta: specific
            ? Object.fromEntries(
                (auto.posts ?? []).map((p) => [
                  p.mediaId,
                  {
                    permalink: p.permalink,
                    thumbnailUrl: p.thumbnailUrl,
                    mediaUrl: p.mediaUrl,
                    mediaType: p.mediaType,
                    caption: p.caption,
                    timestamp: p.postedAt,
                  },
                ])
              )
            : {},
          matchAnyPost: auto.matchAnyPost,
          pendingNextReel: auto.pendingNextReel,
          matchAnyWord: auto.matchAnyWord,
          keywords: auto.keywords,
          dmMessage: auto.dmMessage,
          openingDmEnabled: auto.openingDmEnabled,
          openingDmMessage: auto.openingDmMessage,
          openingDmButtonLabel: auto.openingDmButtonLabel,
          publicReplyEnabled: auto.publicReplyEnabled,
          publicReplyMessages: auto.publicReplyMessages,
          trackedDestinationUrl: auto.trackedLinks[0]?.destinationUrl ?? "",
          secondaryDestinationUrl: auto.trackedLinks[1]?.destinationUrl ?? "",
          secondaryButtonLabel: auto.trackedLinks[1]?.label ?? "Open link",
          requireFollow: auto.requireFollow,
          followPromptMessage: auto.followPromptMessage,
          followPromptButtonLabel: auto.followPromptButtonLabel,
          wholeWordMatch: auto.wholeWordMatch,
          isActive: false,
        }),
      });
      const data = await res.json();
      if (data.success) void fetchAutomations(selectedAccountId);
      else console.error("Duplicate failed:", data.error);
    } catch (err) {
      console.error("Failed to duplicate:", err);
    }
  }

  /** Apply one mutation across every checked campaign, then clear the selection. */
  async function bulkUpdate(action: "activate" | "pause" | "delete") {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    if (
      action === "delete" &&
      !confirm(
        `Delete ${ids.length} campaign${ids.length === 1 ? "" : "s"}? This cannot be undone.`
      )
    ) {
      return;
    }

    setBulkBusy(true);
    try {
      const results = await Promise.allSettled(
        ids.map((id) =>
          action === "delete"
            ? fetch(`/api/automations?id=${id}`, { method: "DELETE" })
            : fetch(`/api/automations?id=${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isActive: action === "activate" }),
              })
        )
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) {
        console.error(`Bulk ${action}: ${failed} of ${ids.length} failed`);
      }
      setSelectedIds(new Set());
      await fetchAutomations(selectedAccountId);
    } finally {
      setBulkBusy(false);
    }
  }

  const query = search.trim().toLowerCase();
  const filtered = automations.filter((a) => {
    if (statusFilter === "active" && !a.isActive) return false;
    if (statusFilter === "paused" && a.isActive) return false;
    if (!query) return true;
    return (
      a.name.toLowerCase().includes(query) ||
      a.keywords.some((k) => k.toLowerCase().includes(query)) ||
      a.dmMessage.toLowerCase().includes(query)
    );
  });

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((a) => selectedIds.has(a.id));
  const someFilteredSelected =
    !allFilteredSelected && filtered.some((a) => selectedIds.has(a.id));

  function toggleSelected(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  return (
    // Dimmed rather than replaced during an account switch: the list on screen
    // is still meaningful, and swapping it for skeletons would be a step
    // backwards from a correct screen to an empty one.
    <div
      className={`space-y-6 transition-opacity duration-150 ${
        refreshing ? "opacity-60" : "opacity-100"
      }`}
    >
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted">
            {filtered.length}
            {filtered.length !== automations.length
              ? ` of ${automations.length}`
              : ""}{" "}
            campaign{automations.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {accounts.length > 1 && (
            <AccountSelect
              accounts={accounts}
              value={selectedAccountId}
              onChange={handleAccountChange}
            />
          )}
          <Link
            href="/campaigns/import"
            className="flex-1 rounded border border-border px-4 py-2 text-center text-sm font-medium text-muted hover:text-foreground sm:flex-none"
          >
            Import
          </Link>
          <Link
            href="/campaigns/new"
            className="flex-1 rounded bg-accent px-4 py-2 text-center text-sm font-medium text-foreground hover:bg-accent-hover sm:flex-none"
          >
            New Campaign
          </Link>
        </div>
      </div>

      {/* Search + status filter */}
      {automations.length > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search campaigns by name, keyword, or message…"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent/40 focus:outline-none"
          />
          <div className="inline-flex shrink-0 rounded-lg bg-surface p-1">
            {(["all", "active", "paused"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`rounded-md px-3 py-1.5 text-sm capitalize transition-colors ${
                  statusFilter === s
                    ? "bg-background font-medium text-foreground ring-1 ring-accent/40"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Bulk selection bar. Select-all applies to what the filters currently
          show, so a filtered "select all" never touches hidden campaigns. */}
      {filtered.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
          <label className="flex items-center gap-2 text-muted">
            <Checkbox
              checked={allFilteredSelected}
              indeterminate={someFilteredSelected}
              onChange={(checked) =>
                setSelectedIds(checked ? new Set(filtered.map((a) => a.id)) : new Set())
              }
              label="Select all campaigns"
            />
            {selectedIds.size > 0
              ? `${selectedIds.size} selected`
              : `Select all ${filtered.length}`}
          </label>
          {selectedIds.size > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => void bulkUpdate("activate")}
                className="rounded border border-border px-2.5 py-1 text-xs text-foreground hover:border-border-hover disabled:opacity-50"
              >
                Activate
              </button>
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => void bulkUpdate("pause")}
                className="rounded border border-border px-2.5 py-1 text-xs text-foreground hover:border-border-hover disabled:opacity-50"
              >
                Pause
              </button>
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => void bulkUpdate("delete")}
                className="rounded border border-error/40 px-2.5 py-1 text-xs text-error hover:border-error disabled:opacity-50"
              >
                Delete
              </button>
              {bulkBusy && <span className="text-xs text-muted">Working…</span>}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {automations.length === 0 && (
        <div className="panel rounded p-8 text-center sm:p-12">
          <h3 className="text-lg font-semibold mb-2">No campaigns yet</h3>
          <p className="text-sm text-muted mb-6 max-w-sm mx-auto">
            Create your first comment-to-DM campaign to turn a post or reel into a measurable conversation flow.
          </p>
          <Link
            href="/campaigns/new"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded bg-accent text-sm font-semibold text-foreground hover:bg-accent-hover transition-colors"
          >
            Create Campaign
          </Link>
        </div>
      )}

      {/* No matches for the current filter */}
      {automations.length > 0 && filtered.length === 0 && (
        <div className="panel rounded p-8 text-center text-sm text-muted">
          No campaigns match your search.
        </div>
      )}

      {/* Campaign cards */}
      <div className="space-y-3">
        {filtered.map((auto) => {
          // Up to three tiles, then a +N chip. Cover posts come from the
          // campaign's own rows, so a campaign on an older post still renders.
          const coverPosts = (auto.posts ?? []).filter((p) => thumbFor(p.mediaId));
          const shown = coverPosts.slice(0, 3);
          const overflow = coverPosts.length - shown.length;
          return (
          <div
            key={auto.id}
            onClick={() => router.push(`/campaigns/${auto.id}`)}
            className="panel rounded p-4 hover:border-border-hover transition-all cursor-pointer"
          >
            {/* Wraps rather than compressing: on a phone the action buttons drop
                to their own line instead of squeezing the campaign summary. */}
            <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
              {/* stopPropagation so ticking a row doesn't also open it. */}
              <div
                onClick={(e) => e.stopPropagation()}
                className="flex shrink-0 items-center pt-1"
              >
                <Checkbox
                  checked={selectedIds.has(auto.id)}
                  onChange={(checked) => toggleSelected(auto.id, checked)}
                  label={`Select ${auto.name}`}
                />
              </div>
              {shown.length > 0 && (
                <div className="flex shrink-0 items-center gap-1">
                  {shown.map((post) => {
                    const videoUrl = videos[post.mediaId];
                    const src = thumbFor(post.mediaId)!;
                    const img = (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={src}
                        alt={post.caption?.slice(0, 40) ?? "Campaign post"}
                        width={48}
                        height={48}
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                        className="h-12 w-12 rounded border border-border object-cover hover:border-border-hover"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    );
                    return videoUrl ? (
                      <button
                        key={post.mediaId}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPlayingVideo({ url: videoUrl, postUrl: post.permalink });
                        }}
                        aria-label="Play reel preview"
                        className="shrink-0"
                      >
                        {img}
                      </button>
                    ) : (
                      <a
                        key={post.mediaId}
                        href={post.permalink ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="shrink-0"
                      >
                        {img}
                      </a>
                    );
                  })}
                  {overflow > 0 && (
                    <span
                      title={`${coverPosts.length} posts in this campaign`}
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded border border-border bg-surface text-xs text-muted"
                    >
                      +{overflow}
                    </span>
                  )}
                </div>
              )}
              <div className="min-w-[12rem] flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <h3 className="text-sm font-semibold truncate">{auto.name}</h3>
                  <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs text-muted">
                    @{auto.instagramAccount.username}
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      auto.isActive
                        ? "bg-success/10 text-success"
                        : "bg-surface-hover text-muted"
                    }`}
                  >
                    {auto.isActive ? "Active" : "Paused"}
                  </span>
                  {auto.pendingNextReel && (
                    <span className="shrink-0 rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
                      Waiting for next reel
                    </span>
                  )}
                  {!auto.matchAnyPost && (auto.posts?.length ?? 0) > 1 && (
                    <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs text-muted">
                      {auto.posts.length} posts
                    </span>
                  )}
                  {auto.postRule != null && (
                    <span className="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                      Auto-adding
                    </span>
                  )}
                  {auto.requireFollow && (
                    <span className="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                      Follow gate
                    </span>
                  )}
                  {auto.trackedLinks.length >= 2 && (
                    <span className="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                      2 links
                    </span>
                  )}
                </div>

                {/* Keywords */}
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {auto.keywords.map((kw) => (
                    <span
                      key={kw}
                      className="px-2 py-0.5 rounded-md bg-accent/10 text-accent text-xs font-medium border border-accent/10"
                    >
                      {kw}
                    </span>
                  ))}
                </div>

                {/* DM preview */}
                <p className="text-sm text-muted truncate">&ldquo;{auto.dmMessage}&rdquo;</p>

                {/* Tracked link sent */}
                {auto.trackedLinks[0]?.trackedUrl && (
                  <p className="mt-2 truncate font-mono text-xs text-muted">
                    {auto.trackedLinks[0].trackedUrl}
                  </p>
                )}

                {/* Stats */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3 text-xs text-muted">
                  <span className="font-medium text-foreground">
                    {auto._count.dmLogs} runs
                  </span>
                  <span>·</span>
                  <span className="font-medium text-foreground">
                    {auto.analytics.ctr}% CTR
                  </span>
                  <span>·</span>
                  <span>{auto.analytics.sent} sent</span>
                  <span>·</span>
                  <span>{auto.analytics.skipped} skipped</span>
                  <span>·</span>
                  <span>{auto.analytics.failed} failed</span>
                  <span>·</span>
                  <span>{auto.analytics.clicks} clicks</span>
                </div>

                {auto.analytics.topKeywords.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {auto.analytics.topKeywords.map((keyword) => (
                      <span
                        key={keyword.keyword}
                        className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-muted"
                      >
                        {keyword.keyword}: {keyword.count}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div
                className="ml-auto flex items-center gap-2"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Copy reel URL */}
                {auto.postUrl && (
                  <button
                    onClick={() => void copyReelUrl(auto)}
                    className="shrink-0 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:border-border-hover hover:text-foreground"
                  >
                    {copiedId === auto.id ? "Copied!" : "Copy URL"}
                  </button>
                )}
                {/* Toggle */}
                <button
                  onClick={() => toggleActive(auto.id, auto.isActive)}
                  className={`
                    relative w-11 h-6 rounded-full transition-colors
                    ${auto.isActive ? "bg-accent" : "bg-border"}
                  `}
                >
                  <span
                    className={`
                      absolute top-1 w-4 h-4 rounded-full bg-background transition-transform shadow-sm
                      ${auto.isActive ? "left-6" : "left-1"}
                    `}
                  />
                </button>

                {/* Kebab menu */}
                <div className="relative">
                  <button
                    onClick={() =>
                      setMenuOpenId((cur) => (cur === auto.id ? null : auto.id))
                    }
                    aria-label="More actions"
                    className="px-2 py-1 rounded text-lg leading-none text-muted hover:text-foreground"
                  >
                    ⋯
                  </button>
                  {menuOpenId === auto.id && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setMenuOpenId(null)}
                      />
                      <div className="absolute right-0 z-20 mt-1 w-36 overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
                        <button
                          onClick={() => void duplicateAutomation(auto)}
                          className="block w-full px-3 py-2 text-left text-sm text-foreground hover:bg-surface-hover"
                        >
                          Duplicate
                        </button>
                        <button
                          onClick={() => {
                            setMenuOpenId(null);
                            void deleteAutomation(auto.id);
                          }}
                          className="block w-full px-3 py-2 text-left text-sm text-error hover:bg-surface-hover"
                        >
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
          );
        })}
      </div>

      {/* Reel lightbox */}
      {playingVideo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-night/60 p-4"
          onClick={() => setPlayingVideo(null)}
        >
          <div
            className="relative flex max-w-full flex-col items-end gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-4 text-sm">
              {playingVideo.postUrl && (
                <a
                  href={playingVideo.postUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted hover:text-foreground"
                >
                  Open on Instagram
                </a>
              )}
              <button
                type="button"
                onClick={() => setPlayingVideo(null)}
                className="text-muted hover:text-foreground"
              >
                Close
              </button>
            </div>
            <video
              src={playingVideo.url}
              controls
              autoPlay
              loop
              playsInline
              className="max-h-[80vh] max-w-full rounded-lg"
            />
          </div>
        </div>
      )}
    </div>
  );
}
