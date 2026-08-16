"use client";

/**
 * Campaign Detail
 *
 * Clicking a campaign opens this read-only view: a summary of the automation
 * on the left, and Insights / Preview tabs on the right. Edit and Stop/Resume
 * live in the top bar.
 */

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import CampaignPreview, { type PreviewTab } from "@/components/campaign-preview";

interface CampaignPostStats {
  mediaId: string;
  source: "MANUAL" | "RULE" | "NEXT_REEL";
  permalink: string | null;
  thumbnailUrl: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
  caption: string | null;
  postedAt: string | null;
  sent: number;
  skipped: number;
  failed: number;
  total: number;
}

interface Campaign {
  id: string;
  name: string;
  postId: string | null;
  postUrl: string | null;
  posts: CampaignPostStats[];
  postStats: CampaignPostStats[];
  postRule: unknown;
  unattributed: { sent: number; skipped: number; failed: number; total: number };
  series: { date: string; sent: number; total: number }[];
  pendingNextReel: boolean;
  matchAnyPost: boolean;
  keywords: string[];
  matchAnyWord: boolean;
  dmTriggerEnabled: boolean;
  dmMessage: string;
  openingDmEnabled: boolean;
  openingDmMessage: string | null;
  openingDmButtonLabel: string | null;
  linkButtonLabel: string | null;
  requireFollow: boolean;
  followPromptMessage: string | null;
  followPromptButtonLabel: string | null;
  followUpEnabled: boolean;
  followUpMessage: string | null;
  followUpDelayMinutes: number | null;
  publicReplyEnabled: boolean;
  publicReplyMessage: string | null;
  publicReplyMessages: string[];
  isActive: boolean;
  instagramAccountId: string;
  instagramAccount: { username: string };
  trackedLinks?: {
    destinationUrl: string;
    label?: string | null;
    trackedUrl?: string;
  }[];
  analytics: {
    sent: number;
    skipped: number;
    failed: number;
    clicks: number;
    ctr: number;
    topKeywords: { keyword: string; count: number }[];
  };
}

type Tab = "insights" | "preview";

export default function CampaignDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  // Instagram's CDN URLs are signed and expire, so the cached thumbnail is only
  // a first paint — the live fetch below supersedes it when it lands.
  const [freshThumb, setFreshThumb] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("insights");
  const [previewTab, setPreviewTab] = useState<PreviewTab>("dm");
  const [busy, setBusy] = useState(false);

  // One campaign, with its per-post and time-series breakdowns. This used to
  // fetch every campaign in the workspace and pick one out of the array.
  useEffect(() => {
    fetch(`/api/automations/${id}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((payload) => {
        if (!payload.success) return setNotFound(true);
        setCampaign(payload.data as Campaign);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!campaign) return;
    const acct = campaign.instagramAccountId;
    fetch(`/api/instagram/profile?instagramAccountId=${acct}`)
      .then((r) => r.json())
      .then((d) =>
        setAvatarUrl(d.success ? d.data.profilePictureUrl ?? null : null)
      )
      .catch(() => setAvatarUrl(null));

    const primary = campaign.posts?.[0];
    if (primary) {
      fetch(`/api/instagram/posts?instagramAccountId=${acct}&limit=50`)
        .then((r) => r.json())
        .then((payload) => {
          if (!payload.success) return;
          const hit = (
            payload.data as {
              id: string;
              thumbnail_url?: string;
              media_url?: string;
            }[]
          ).find((p) => p.id === primary.mediaId);
          const fresh = hit?.thumbnail_url ?? hit?.media_url;
          if (fresh) setFreshThumb(fresh);
        })
        .catch(() => {});
    }
  }, [campaign]);

  async function toggleActive() {
    if (!campaign) return;
    setBusy(true);
    try {
      await fetch(`/api/automations?id=${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !campaign.isActive }),
      });
      setCampaign({ ...campaign, isActive: !campaign.isActive });
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="panel h-64 rounded" />;
  }
  if (notFound || !campaign) {
    return (
      <div className="panel rounded p-8 text-center">
        <p className="text-sm text-muted">Campaign not found.</p>
        <button
          onClick={() => router.push("/campaigns")}
          className="mt-4 rounded border border-border px-4 py-2 text-sm text-muted hover:text-foreground"
        >
          Back to campaigns
        </button>
      </div>
    );
  }

  const publicReplies =
    campaign.publicReplyMessages && campaign.publicReplyMessages.length > 0
      ? campaign.publicReplyMessages
      : campaign.publicReplyMessage
        ? [campaign.publicReplyMessage]
        : [];
  const hasLink = Boolean(campaign.trackedLinks?.[0]?.destinationUrl);
  const hasSecondLink = Boolean(campaign.trackedLinks?.[1]?.destinationUrl);

  const trigger = campaign.matchAnyPost
    ? "Any post or reel"
    : campaign.pendingNextReel
      ? "Your next reel"
      : "A specific post or reel";
  const matchText = campaign.matchAnyWord
    ? "Any comment"
    : campaign.keywords.join(", ") || "No keywords";

  const metrics = [
    { label: "Sends", value: campaign.analytics.sent },
    { label: "Clicks", value: campaign.analytics.clicks },
    { label: "CTR", value: `${campaign.analytics.ctr}%` },
    { label: "Failed", value: campaign.analytics.failed },
  ];

  // Cached URL paints first; the freshly fetched one wins once it arrives.
  const primaryPost = campaign.posts?.[0];
  const postThumb =
    freshThumb ?? primaryPost?.thumbnailUrl ?? primaryPost?.mediaUrl ?? null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_1fr]">
      {/* Left: config summary */}
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Link
            href="/campaigns"
            className="text-sm text-muted hover:text-foreground"
          >
            &larr; Campaigns
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <h1 className="truncate text-lg font-semibold">{campaign.name}</h1>
          <span
            className={`shrink-0 rounded px-2 py-0.5 text-xs font-semibold ${
              campaign.isActive
                ? "bg-success/10 text-success"
                : "bg-surface-hover text-muted"
            }`}
          >
            {campaign.isActive ? "LIVE" : "Paused"}
          </span>
        </div>

        <Summary title="When someone comments on">
          <div className="flex items-center gap-3">
            {postThumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={postThumb}
                alt="Post"
                className="h-14 w-14 rounded object-cover"
              />
            ) : (
              <div className="grid h-14 w-14 place-items-center rounded bg-surface-hover text-[10px] text-muted">
                {campaign.matchAnyPost || campaign.pendingNextReel ? "Any" : "Post"}
              </div>
            )}
            <span className="text-sm text-foreground">{trigger}</span>
          </div>
        </Summary>

        <Summary title="And this comment has">
          <FieldBox>{matchText}</FieldBox>
          {campaign.dmTriggerEnabled && (
            <p className="text-xs text-muted">
              Also replies when someone DMs{" "}
              {campaign.matchAnyWord ? "anything" : "these words"}.
            </p>
          )}
          {publicReplies.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted">Public reply under the post</p>
              {publicReplies.map((m, i) => (
                <FieldBox key={i}>{m}</FieldBox>
              ))}
            </div>
          )}
        </Summary>

        {campaign.openingDmEnabled && (
          <Summary title="They will get an opening DM">
            <FieldBox>{campaign.openingDmMessage || "Opening message"}</FieldBox>
            <FieldBox>{campaign.openingDmButtonLabel || "Button"}</FieldBox>
          </Summary>
        )}

        {campaign.requireFollow && (
          <Summary title="They must follow first">
            <FieldBox>
              {campaign.followPromptMessage ||
                "quick favor before i send your link. i don't make any money from this, it's free. if you want to support me, just don't unfollow after, and star the repo on github if it helps you. tap the button once you're following and i'll send it over"}
            </FieldBox>
            <FieldBox>
              {campaign.followPromptButtonLabel || "i'm following"}
            </FieldBox>
          </Summary>
        )}

        <Summary title="And then, they will get a DM">
          <FieldBox>{campaign.dmMessage}</FieldBox>
          {hasLink && (
            <FieldBox>{campaign.linkButtonLabel || "Open link"}</FieldBox>
          )}
          {hasSecondLink && (
            <FieldBox>
              {campaign.trackedLinks?.[1]?.label || "Open link"}
            </FieldBox>
          )}
        </Summary>

        {hasLink && (
          <Summary title="The exact link sent">
            {campaign.trackedLinks
              ?.filter((link) => link.destinationUrl)
              .map((link, i) => (
                <div key={i} className="space-y-1">
                  <div className="rounded border border-border bg-surface px-3 py-2">
                    <p className="select-all break-all font-mono text-xs text-foreground">
                      {link.trackedUrl ?? link.destinationUrl}
                    </p>
                  </div>
                  <p className="text-xs text-muted">
                    {link.label ? `${link.label} · ` : ""}redirects to{" "}
                    <span className="break-all">{link.destinationUrl}</span>
                  </p>
                </div>
              ))}
          </Summary>
        )}

        {campaign.followUpEnabled && campaign.followUpMessage && (
          <Summary title="Then a follow-up message">
            <FieldBox>{campaign.followUpMessage}</FieldBox>
            <p className="text-xs text-muted">
              {campaign.followUpDelayMinutes && campaign.followUpDelayMinutes > 0
                ? `Sent ${campaign.followUpDelayMinutes} min after the link.`
                : "Sent right after the link."}
            </p>
          </Summary>
        )}
      </div>

      {/* Right: top bar + tabs */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-3 border-b border-border pb-3">
          <div className="flex gap-4">
            <TabButton active={tab === "insights"} onClick={() => setTab("insights")}>
              Insights
            </TabButton>
            <TabButton active={tab === "preview"} onClick={() => setTab("preview")}>
              Preview
            </TabButton>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/campaigns/${campaign.id}/edit`}
              className="rounded border border-border px-3 py-1.5 text-sm text-muted hover:text-foreground"
            >
              Edit
            </Link>
            <button
              onClick={toggleActive}
              disabled={busy}
              className={`rounded border px-3 py-1.5 text-sm disabled:opacity-50 ${
                campaign.isActive
                  ? "border-error/30 text-error hover:bg-error/10"
                  : "border-success/30 text-success hover:bg-success/10"
              }`}
            >
              {campaign.isActive ? "Stop" : "Resume"}
            </button>
          </div>
        </div>

        {tab === "insights" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {metrics.map((m) => (
                <div key={m.label} className="panel rounded p-4">
                  <p className="text-sm text-muted">{m.label}</p>
                  <p className="mt-1 text-2xl font-semibold text-foreground">
                    {m.value}
                  </p>
                </div>
              ))}
            </div>

            <ActivityChart series={campaign.series ?? []} />

            {(campaign.analytics.topKeywords ?? []).length > 0 && (
              <div className="panel rounded p-4">
                <h3 className="text-sm font-semibold text-foreground">
                  Top keywords
                </h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {campaign.analytics.topKeywords.map((k) => (
                    <span
                      key={k.keyword}
                      className="rounded-full border border-border px-2.5 py-1 text-xs text-muted"
                    >
                      {k.keyword}
                      <span className="ml-1.5 text-foreground">{k.count}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <PostBreakdown
              posts={campaign.postStats ?? []}
              unattributed={campaign.unattributed}
            />
          </div>
        )}

        {tab === "preview" && (
          <div className="flex justify-center sm:justify-start">
          <CampaignPreview
            tab={previewTab}
            onTabChange={setPreviewTab}
            username={campaign.instagramAccount.username}
            avatarUrl={avatarUrl}
            postThumb={postThumb}
            caption=""
            sampleComment={campaign.matchAnyWord ? "nice!" : campaign.keywords[0] ?? "LINK"}
            dmTriggerEnabled={campaign.dmTriggerEnabled}
            publicReplyEnabled={campaign.publicReplyEnabled}
            publicReplyMessage={publicReplies[0] ?? ""}
            openingDmEnabled={campaign.openingDmEnabled}
            openingDmMessage={campaign.openingDmMessage ?? ""}
            openingDmButtonLabel={campaign.openingDmButtonLabel ?? ""}
            revealMessage={campaign.dmMessage}
            hasLink={hasLink}
            linkButtonLabel={campaign.linkButtonLabel ?? "Open link"}
            linkUrl={
              campaign.trackedLinks?.[0]?.trackedUrl ??
              campaign.trackedLinks?.[0]?.destinationUrl
            }
            hasSecondLink={hasSecondLink}
            secondLinkButtonLabel={
              campaign.trackedLinks?.[1]?.label ?? "Open link"
            }
            requireFollow={campaign.requireFollow}
            followPromptMessage={campaign.followPromptMessage ?? ""}
            followPromptButtonLabel={
              campaign.followPromptButtonLabel ?? "i'm following"
            }
            followUpEnabled={campaign.followUpEnabled ?? false}
            followUpMessage={campaign.followUpMessage ?? ""}
            followUpDelayMinutes={campaign.followUpDelayMinutes ?? 0}
          />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Which post actually drove the DMs.
 *
 * Only meaningful because DmLog carries the media id — with one post per
 * campaign it was implied by the campaign itself and there was nothing to break
 * down.
 */
function PostBreakdown({
  posts,
  unattributed,
}: {
  posts: CampaignPostStats[];
  unattributed?: { sent: number; total: number };
}) {
  if (posts.length === 0) return null;

  const best = posts[0]?.sent ?? 0;

  return (
    <div className="panel rounded p-4">
      <h3 className="text-sm font-semibold text-foreground">
        Per-post results
        <span className="ml-2 font-normal text-muted">
          {posts.length} post{posts.length === 1 ? "" : "s"}
        </span>
      </h3>
      {/* Scrolls inside itself so a narrow screen never scrolls the page. */}
      <div className="mt-3 -mx-4 overflow-x-auto px-4">
        <table className="w-full min-w-125 text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th className="py-2 pr-3 font-medium">Post</th>
              <th className="py-2 pr-3 font-medium">Added</th>
              <th className="py-2 pr-3 text-right font-medium">Sent</th>
              <th className="py-2 pr-3 text-right font-medium">Skipped</th>
              <th className="py-2 text-right font-medium">Failed</th>
            </tr>
          </thead>
          <tbody>
            {posts.map((post) => {
              const thumb = post.thumbnailUrl ?? post.mediaUrl;
              return (
                <tr key={post.mediaId} className="border-b border-border/50">
                  <td className="py-2 pr-3">
                    <a
                      href={post.permalink ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 hover:text-accent"
                    >
                      {thumb ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={thumb}
                          alt=""
                          width={32}
                          height={32}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          className="h-8 w-8 shrink-0 rounded border border-border object-cover"
                          onError={(e) => {
                            e.currentTarget.style.visibility = "hidden";
                          }}
                        />
                      ) : (
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-border bg-surface text-[10px] text-muted">
                          {post.mediaType?.[0] ?? "?"}
                        </span>
                      )}
                      <span className="line-clamp-1 max-w-[16rem] text-xs">
                        {post.caption?.slice(0, 60) || post.mediaId}
                      </span>
                    </a>
                  </td>
                  <td className="py-2 pr-3 text-xs text-muted">
                    {post.source === "MANUAL"
                      ? "By hand"
                      : post.source === "RULE"
                        ? "By rule"
                        : "Next reel"}
                  </td>
                  <td className="py-2 pr-3 text-right">
                    <span className="inline-flex items-center gap-2">
                      {/* Bar relative to the best post, so the winner is obvious
                          without reading every number. */}
                      <span
                        aria-hidden
                        className="hidden h-1.5 rounded-full bg-accent/40 sm:block"
                        style={{
                          width: best > 0 ? `${Math.round((post.sent / best) * 48)}px` : 0,
                        }}
                      />
                      <span className="text-foreground">{post.sent}</span>
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-right text-muted">{post.skipped}</td>
                  <td className="py-2 text-right text-muted">{post.failed}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {unattributed && unattributed.total > 0 && (
        <p className="mt-3 text-xs text-muted">
          {unattributed.sent} sent from the DM trigger, which has no post attached.
        </p>
      )}
    </div>
  );
}

/** Runs per day over the campaign's recent history. */
function ActivityChart({
  series,
}: {
  series: { date: string; sent: number; total: number }[];
}) {
  if (series.length === 0) return null;
  const peak = Math.max(...series.map((d) => d.total), 1);
  const hasActivity = series.some((d) => d.total > 0);

  return (
    <div className="panel rounded p-4">
      <h3 className="text-sm font-semibold text-foreground">Activity</h3>
      {hasActivity ? (
        <div className="mt-4 flex h-28 items-end gap-1">
          {series.map((day) => (
            <div
              key={day.date}
              title={`${day.date}: ${day.sent} sent of ${day.total} runs`}
              className="flex flex-1 flex-col items-center gap-1"
            >
              <div className="flex w-full flex-1 items-end">
                <div
                  className="w-full rounded-t bg-accent/70"
                  style={{ height: `${Math.round((day.sent / peak) * 100)}%` }}
                />
              </div>
              <span className="text-[10px] text-muted">{day.date.split(" ")[1]}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted">No runs yet in this window.</p>
      )}
    </div>
  );
}

function Summary({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {children}
    </div>
  );
}

function FieldBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded border border-border bg-surface px-3 py-2 text-sm text-foreground">
      {children}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`border-b-2 pb-2 text-sm font-medium ${
        active
          ? "border-accent text-foreground"
          : "border-transparent text-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
