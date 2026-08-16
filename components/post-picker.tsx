"use client";

/* eslint-disable @next/next/no-img-element */

/**
 * Post Picker
 *
 * Grid of Instagram post thumbnails, multi-selectable. A campaign covers a set
 * of posts, picked two ways that combine:
 *
 *   - by hand — tick tiles, filter by type/caption, or select everything the
 *     current filter shows;
 *   - by rule — describe the posts ("Reels whose caption mentions #launch") and
 *     either apply that as a one-off selection or keep it active, in which case
 *     posts published later are enrolled automatically.
 *
 * The rule preview runs the same matcher the server uses (lib/campaigns/
 * post-rules.ts) over the library already in memory, so the count shown here is
 * the count that will be enrolled.
 */

import { useEffect, useMemo, useState } from "react";
import { readCache, writeCache } from "@/lib/client-cache";
import {
  MAX_POSTS_PER_CAMPAIGN,
  classifyMediaType,
  emptyPostRule,
  matchesPostRule,
  selectPostsByRule,
  type PostMediaType,
  type PostRule,
} from "@/lib/campaigns/post-rules";
import KeywordInput from "./keyword-input";

export interface InstagramPost {
  id: string;
  caption?: string;
  media_type: string;
  media_product_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp: string;
}

const TYPE_FILTERS: { label: string; value: PostMediaType | "ALL" }[] = [
  { label: "All", value: "ALL" },
  { label: "Reels", value: "REEL" },
  { label: "Images", value: "IMAGE" },
  { label: "Carousels", value: "CAROUSEL" },
];

interface PostPickerProps {
  selectedPostIds: string[];
  instagramAccountId?: string | null;
  /** postId -> name of another campaign already covering it. Flagged in the grid. */
  usedPostIds?: Record<string, string>;
  /** Posts a saved rule enrolled. Shown as covered, but not part of the manual set. */
  rulePostIds?: string[];
  rule: PostRule | null;
  onRuleChange: (rule: PostRule | null) => void;
  onSelectionChange: (postIds: string[], posts: InstagramPost[]) => void;
}

export default function PostPicker({
  selectedPostIds,
  instagramAccountId,
  usedPostIds,
  rulePostIds,
  rule,
  onRuleChange,
  onSelectionChange,
}: PostPickerProps) {
  const [posts, setPosts] = useState<InstagramPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<PostMediaType | "ALL">("ALL");
  const [ruleOpen, setRuleOpen] = useState(false);
  // The rule being edited. Kept local so opening the panel to look around
  // doesn't save a rule the user never asked to keep.
  const [draft, setDraft] = useState<PostRule>(
    () => rule ?? emptyPostRule(new Date().toISOString())
  );
  // The post currently hovered — its video (if it's a reel) plays a preview.
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (instagramAccountId) {
      params.set("instagramAccountId", instagramAccountId);
    }
    // Load the full library so older posts/reels are selectable, not just the
    // most recent page.
    params.set("all", "true");

    // Show the cached library instantly (stale-while-revalidate), then refresh.
    const cacheKey = `ig-posts:${instagramAccountId ?? "default"}`;
    const cached = readCache<InstagramPost[]>(cacheKey, 15 * 60 * 1000);
    // Hydrating state from cache is a legitimate effect use here.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (cached.data) {
      setPosts(cached.data);
      setLoading(false);
    }
    /* eslint-enable react-hooks/set-state-in-effect */

    fetch(`/api/instagram/posts${params.size ? `?${params}` : ""}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.success) {
          setPosts(data.data);
          writeCache(cacheKey, data.data);
        } else if (!cached.data) {
          setError(data.error ?? "Failed to load posts");
        }
      })
      .catch(() => {
        if (!cancelled && !cached.data) setError("Failed to load posts");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [instagramAccountId]);

  const selected = useMemo(() => new Set(selectedPostIds), [selectedPostIds]);
  const ruleCovered = useMemo(() => new Set(rulePostIds ?? []), [rulePostIds]);
  const byId = useMemo(() => new Map(posts.map((p) => [p.id, p])), [posts]);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return posts.filter((post) => {
      if (typeFilter !== "ALL" && classifyMediaType(post) !== typeFilter) return false;
      if (term && !(post.caption ?? "").toLowerCase().includes(term)) return false;
      return true;
    });
  }, [posts, query, typeFilter]);

  // Live preview of the rule being edited, against the whole library.
  const ruleMatches = useMemo(
    () => (ruleOpen ? selectPostsByRule(posts, draft) : []),
    [ruleOpen, posts, draft]
  );

  function emit(ids: string[]) {
    const capped = ids.slice(0, MAX_POSTS_PER_CAMPAIGN);
    onSelectionChange(
      capped,
      capped.map((id) => byId.get(id)).filter((p): p is InstagramPost => Boolean(p))
    );
  }

  function toggle(post: InstagramPost) {
    if (selected.has(post.id)) {
      emit(selectedPostIds.filter((id) => id !== post.id));
    } else {
      emit([...selectedPostIds, post.id]);
    }
  }

  function selectAllVisible() {
    const merged = [...new Set([...selectedPostIds, ...visible.map((p) => p.id)])];
    emit(merged);
  }

  function updateDraft(patch: Partial<PostRule>) {
    setDraft((cur) => ({ ...cur, ...patch }));
  }

  function toggleType(value: PostMediaType) {
    updateDraft({
      mediaTypes: draft.mediaTypes.includes(value)
        ? draft.mediaTypes.filter((t) => t !== value)
        : [...draft.mediaTypes, value],
    });
  }

  if (loading) {
    return (
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="aspect-square rounded bg-surface" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-muted">{error}</p>
        <p className="text-xs text-muted mt-1">Connect your Instagram account first</p>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-muted">No posts found</p>
      </div>
    );
  }

  const atCap = selectedPostIds.length >= MAX_POSTS_PER_CAMPAIGN;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your posts by caption…"
          className="min-w-45 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent/40 focus:outline-none"
        />
        <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-0.5">
          {TYPE_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setTypeFilter(filter.value)}
              aria-pressed={typeFilter === filter.value}
              className={`rounded px-2.5 py-1 text-xs transition-colors ${
                typeFilter === filter.value
                  ? "bg-accent text-foreground"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={selectAllVisible}
            disabled={visible.length === 0 || atCap}
            className="rounded border border-border px-2 py-1 text-foreground hover:border-border-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            Select all {visible.length}
          </button>
          <button
            type="button"
            onClick={() => emit([])}
            disabled={selectedPostIds.length === 0}
            className="rounded border border-border px-2 py-1 text-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => setRuleOpen((open) => !open)}
            aria-expanded={ruleOpen}
            className={`rounded border px-2 py-1 ${
              rule
                ? "border-accent/50 text-accent"
                : "border-border text-muted hover:text-foreground"
            }`}
          >
            {rule ? "Rule active" : "Select by rule"}
          </button>
        </div>
        <span className="text-muted">
          {visible.length} of {posts.length} shown
        </span>
      </div>

      {ruleOpen && (
        <div className="space-y-3 rounded-lg border border-border bg-surface p-3">
          <p className="text-xs text-muted">
            Describe the posts this campaign should cover. Keep the rule active and
            anything you publish later that matches is added automatically.
          </p>

          <div className="space-y-1.5">
            <label className="text-xs text-foreground">Media type</label>
            <div className="flex flex-wrap gap-1.5">
              {TYPE_FILTERS.filter((f) => f.value !== "ALL").map((filter) => {
                const value = filter.value as PostMediaType;
                const on = draft.mediaTypes.includes(value);
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => toggleType(value)}
                    aria-pressed={on}
                    className={`rounded border px-2.5 py-1 text-xs ${
                      on
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border text-muted hover:text-foreground"
                    }`}
                  >
                    {filter.label}
                  </button>
                );
              })}
              {draft.mediaTypes.length === 0 && (
                <span className="self-center text-xs text-muted">Any type</span>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-foreground">Caption contains</label>
            <KeywordInput
              keywords={draft.captionContains}
              onChange={(captionContains) => updateDraft({ captionContains })}
              max={20}
              uppercase={false}
              noun="terms"
              placeholder="#launch, ebook…"
            />
            {draft.captionContains.length > 1 && (
              <label className="flex items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={draft.captionMatchAll}
                  onChange={(e) => updateDraft({ captionMatchAll: e.target.checked })}
                  className="h-3.5 w-3.5 accent-accent"
                />
                Must contain every term (default: any one)
              </label>
            )}
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <label className="text-xs text-foreground">Posted after</label>
              <input
                type="date"
                value={draft.postedAfter ? draft.postedAfter.slice(0, 10) : ""}
                onChange={(e) =>
                  updateDraft({
                    postedAfter: e.target.value
                      ? new Date(`${e.target.value}T00:00:00`).toISOString()
                      : null,
                  })
                }
                className="rounded border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:border-accent/40 focus:outline-none"
              />
            </div>
            <label className="flex items-center gap-2 pb-1.5 text-xs text-muted">
              <input
                type="checkbox"
                checked={draft.futureOnly}
                onChange={(e) => updateDraft({ futureOnly: e.target.checked })}
                className="h-3.5 w-3.5 accent-accent"
              />
              Only posts published from now on
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
            <p className="text-xs text-muted">
              Matches <span className="text-foreground">{ruleMatches.length}</span> of{" "}
              {posts.length} posts
              {draft.futureOnly && ruleMatches.length === 0
                ? " — future posts only, so nothing existing qualifies"
                : ""}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => emit([...new Set([...selectedPostIds, ...ruleMatches.map((p) => p.id)])])}
                disabled={ruleMatches.length === 0}
                className="rounded border border-border px-2.5 py-1 text-xs text-foreground hover:border-border-hover disabled:cursor-not-allowed disabled:opacity-40"
              >
                Apply as selection
              </button>
              {rule ? (
                <button
                  type="button"
                  onClick={() => onRuleChange(null)}
                  className="rounded border border-error/40 px-2.5 py-1 text-xs text-error hover:border-error"
                >
                  Turn rule off
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onRuleChange(draft)}
                  className="rounded bg-accent px-2.5 py-1 text-xs text-foreground hover:opacity-90"
                >
                  Keep rule active
                </button>
              )}
            </div>
          </div>

          {rule && (
            <button
              type="button"
              onClick={() => onRuleChange(draft)}
              className="text-xs text-accent hover:underline"
            >
              Update the active rule to these conditions
            </button>
          )}
        </div>
      )}

      {visible.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">
          No posts match the current filters
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] text-muted">
            {usedPostIds && Object.keys(usedPostIds).length > 0 && (
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm border border-warning/50" />
                Also used by another campaign
              </span>
            )}
            {ruleCovered.size > 0 && (
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm border border-accent/40 bg-accent/10" />
                Added by your rule
              </span>
            )}
          </div>
          <div className="grid max-h-112 grid-cols-3 gap-2 overflow-y-auto p-1 sm:grid-cols-4">
            {visible.map((post) => {
              const isSelected = selected.has(post.id);
              const byRule = !isSelected && ruleCovered.has(post.id);
              const usedByName = usedPostIds?.[post.id];
              const isUsed = Boolean(usedByName) && !isSelected;
              const thumb = post.thumbnail_url ?? post.media_url;
              const isVideo = post.media_type === "VIDEO";
              const showVideo =
                isVideo && hoveredId === post.id && Boolean(post.media_url);
              const blockedByCap = atCap && !isSelected;
              return (
                <button
                  key={post.id}
                  type="button"
                  onClick={() => toggle(post)}
                  disabled={blockedByCap}
                  onMouseEnter={() => setHoveredId(post.id)}
                  onMouseLeave={() =>
                    setHoveredId((cur) => (cur === post.id ? null : cur))
                  }
                  aria-pressed={isSelected}
                  title={
                    blockedByCap
                      ? `Limit of ${MAX_POSTS_PER_CAMPAIGN} posts reached`
                      : isUsed
                        ? `Also used by "${usedByName}"`
                        : byRule
                          ? "Added by your rule"
                          : undefined
                  }
                  className={`
                    relative aspect-square overflow-hidden rounded border-2 disabled:cursor-not-allowed disabled:opacity-40
                    ${
                      isSelected
                        ? "border-accent"
                        : byRule
                          ? "border-accent/40"
                          : isUsed
                            ? "border-warning/40 hover:border-warning/60"
                            : "border-border hover:border-border-hover"
                    }
                  `}
                >
                  {thumb ? (
                    <img
                      src={thumb}
                      alt={post.caption?.slice(0, 50) ?? "Instagram post"}
                      className={`h-full w-full object-cover ${isUsed ? "opacity-75" : ""}`}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-surface">
                      <span className="text-xs text-muted">No image</span>
                    </div>
                  )}
                  {showVideo && (
                    <video
                      src={post.media_url}
                      poster={thumb}
                      autoPlay
                      muted
                      loop
                      playsInline
                      preload="none"
                      className={`absolute inset-0 h-full w-full object-cover ${
                        isUsed ? "opacity-60" : ""
                      }`}
                    />
                  )}
                  <span
                    aria-hidden
                    className={`absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full border text-[11px] leading-none ${
                      isSelected
                        ? "border-accent bg-accent text-foreground"
                        : "border-border bg-night/60 text-transparent"
                    }`}
                  >
                    ✓
                  </span>
                  {byRule && (
                    <span className="absolute inset-x-0 bottom-0 bg-accent/70 py-0.5 text-[10px] text-foreground">
                      Rule
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}

      {selectedPostIds.length > 0 && (
        <div className="sticky bottom-0 space-y-2 rounded-lg border border-border bg-surface p-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-foreground">
              {selectedPostIds.length} post{selectedPostIds.length === 1 ? "" : "s"}{" "}
              selected
              {atCap ? ` (max ${MAX_POSTS_PER_CAMPAIGN})` : ""}
            </span>
            <button
              type="button"
              onClick={() => emit([])}
              className="text-muted hover:text-foreground"
            >
              Clear all
            </button>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {selectedPostIds.map((id) => {
              const post = byId.get(id);
              const thumb = post?.thumbnail_url ?? post?.media_url;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => emit(selectedPostIds.filter((x) => x !== id))}
                  title="Remove from selection"
                  className="group relative h-12 w-12 shrink-0 overflow-hidden rounded border border-border"
                >
                  {thumb ? (
                    <img src={thumb} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center bg-background text-[10px] text-muted">
                      ?
                    </span>
                  )}
                  <span className="absolute inset-0 hidden items-center justify-center bg-night/60 text-xs text-foreground group-hover:flex">
                    ×
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** Metadata the builder sends so the server can cache thumbnails. */
export function toPostMeta(posts: InstagramPost[]) {
  const meta: Record<
    string,
    {
      permalink: string | null;
      thumbnailUrl: string | null;
      mediaUrl: string | null;
      mediaType: PostMediaType;
      caption: string | null;
      timestamp: string | null;
    }
  > = {};
  for (const post of posts) {
    meta[post.id] = {
      permalink: post.permalink ?? null,
      thumbnailUrl: post.thumbnail_url ?? post.media_url ?? null,
      mediaUrl: post.media_url ?? null,
      mediaType: classifyMediaType(post),
      caption: post.caption ?? null,
      timestamp: post.timestamp ?? null,
    };
  }
  return meta;
}

/** Exported for the builder's "would this rule have caught it" hints. */
export { matchesPostRule };
