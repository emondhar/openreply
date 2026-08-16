/**
 * Campaign overlap detection.
 *
 * Instagram allows exactly ONE private reply per comment, ever — across every
 * campaign, forever. So when two campaigns both cover the same post and both
 * match the same comment, only one of them can DM. The worker resolves that
 * deterministically (most specific wins, see specificity() in dm-worker.ts) and
 * logs the loser as SKIPPED_DEDUP.
 *
 * That resolution is correct but invisible: the owner sees one campaign quietly
 * doing nothing. This module finds overlaps at the moment they are created — on
 * save, and when a rule enrolls a post — and emails whoever can act on it.
 *
 * Overlap is legal, not an error. It is never blocked, only reported.
 */

import { prisma } from "@/lib/db/client";
import { getBaseUrl } from "@/lib/env";
import { escapeHtml, isEmailConfigured, sendEmail } from "@/lib/email/send";

/** Don't re-send the same pairing more than once a day. */
const ALERT_THROTTLE_MS = 24 * 60 * 60 * 1000;

export interface OverlapCampaign {
  id: string;
  name: string;
}

export interface PostOverlap {
  mediaId: string;
  permalink: string | null;
  thumbnailUrl: string | null;
  campaigns: OverlapCampaign[];
}

/**
 * Which of `mediaIds` are already covered by another active campaign on the
 * same Instagram account.
 */
export async function findOverlaps(params: {
  instagramAccountId: string;
  automationId: string | null;
  mediaIds: string[];
}): Promise<PostOverlap[]> {
  const { instagramAccountId, automationId, mediaIds } = params;
  if (mediaIds.length === 0) return [];

  const rows = await prisma.automationPost.findMany({
    where: {
      mediaId: { in: mediaIds },
      excluded: false,
      automation: {
        isActive: true,
        instagramAccountId,
        ...(automationId ? { id: { not: automationId } } : {}),
      },
    },
    select: {
      mediaId: true,
      permalink: true,
      thumbnailUrl: true,
      automation: { select: { id: true, name: true } },
    },
  });

  const byMedia = new Map<string, PostOverlap>();
  for (const row of rows) {
    let entry = byMedia.get(row.mediaId);
    if (!entry) {
      entry = {
        mediaId: row.mediaId,
        permalink: row.permalink,
        thumbnailUrl: row.thumbnailUrl,
        campaigns: [],
      };
      byMedia.set(row.mediaId, entry);
    }
    entry.permalink ??= row.permalink;
    entry.thumbnailUrl ??= row.thumbnailUrl;
    entry.campaigns.push(row.automation);
  }

  return [...byMedia.values()];
}

/** Stable key for one campaign pairing, direction-independent. */
function pairKey(a: string, b: string): string {
  return a < b ? `overlap:${a}:${b}` : `overlap:${b}:${a}`;
}

async function recipientsFor(workspaceId: string): Promise<string[]> {
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId, role: { in: ["OWNER", "ADMIN"] } },
    select: { user: { select: { email: true } } },
  });
  const emails = members
    .map((m) => m.user.email)
    .filter((e): e is string => Boolean(e));

  if (emails.length > 0) return emails;

  // No membership rows with an email (possible on a freshly seeded workspace) —
  // fall back to the owner.
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { owner: { select: { email: true } } },
  });
  return workspace?.owner.email ? [workspace.owner.email] : [];
}

function renderEmail(params: {
  campaignName: string;
  campaignId: string;
  overlaps: PostOverlap[];
  trigger: "save" | "rule";
}): { subject: string; html: string; text: string } {
  const { campaignName, campaignId, overlaps, trigger } = params;
  const base = getBaseUrl();
  const postCount = overlaps.length;
  const others = [
    ...new Map(
      overlaps.flatMap((o) => o.campaigns.map((c) => [c.id, c] as const))
    ).values(),
  ];

  const subject = `"${campaignName}" overlaps ${postCount} post${postCount === 1 ? "" : "s"} with ${others.length} other campaign${others.length === 1 ? "" : "s"}`;

  const lead =
    trigger === "rule"
      ? `A targeting rule on <strong>${escapeHtml(campaignName)}</strong> just enrolled posts that another campaign already covers.`
      : `<strong>${escapeHtml(campaignName)}</strong> was saved covering posts another campaign already covers.`;

  const rows = overlaps
    .map((o) => {
      const link = o.permalink
        ? `<a href="${escapeHtml(o.permalink)}">${escapeHtml(o.mediaId)}</a>`
        : escapeHtml(o.mediaId);
      const names = o.campaigns.map((c) => escapeHtml(c.name)).join(", ");
      return `<tr><td style="padding:6px 12px 6px 0">${link}</td><td style="padding:6px 0">${names}</td></tr>`;
    })
    .join("");

  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.6;color:#18181b">
      <p>${lead}</p>
      <p>Instagram allows <strong>one private reply per comment, ever</strong>. When a comment matches both campaigns only one DM can go out — the more specific campaign wins (a post you picked by hand beats one a rule added, which beats an “any post” campaign). The other is logged as skipped.</p>
      <table style="border-collapse:collapse;margin:16px 0">
        <tr><th align="left" style="padding:6px 12px 6px 0;border-bottom:1px solid #e4e4e7">Post</th><th align="left" style="padding:6px 0;border-bottom:1px solid #e4e4e7">Also covered by</th></tr>
        ${rows}
      </table>
      <p><a href="${base}/campaigns/${campaignId}">Review ${escapeHtml(campaignName)}</a></p>
      <p style="color:#71717a;font-size:12px">If this is intentional, no action is needed. You will not get another alert for these campaigns for 24 hours.</p>
    </div>`;

  const text = [
    trigger === "rule"
      ? `A rule on "${campaignName}" enrolled posts another campaign already covers.`
      : `"${campaignName}" was saved covering posts another campaign already covers.`,
    "",
    "Instagram allows one private reply per comment, ever. The more specific campaign wins; the other is skipped.",
    "",
    ...overlaps.map((o) => `- ${o.permalink ?? o.mediaId} — also: ${o.campaigns.map((c) => c.name).join(", ")}`),
    "",
    `${base}/campaigns/${campaignId}`,
  ].join("\n");

  return { subject, html, text };
}

/**
 * Email the workspace admins about newly created overlaps, at most once per
 * campaign pairing per day.
 *
 * The throttle is an OperationalEvent lookup rather than a new table — the same
 * table the polling sweep already writes to, so the alert history is visible in
 * diagnostics alongside everything else. Fails soft throughout.
 */
export async function notifyOverlaps(params: {
  workspaceId: string;
  automationId: string;
  campaignName: string;
  overlaps: PostOverlap[];
  trigger: "save" | "rule";
}): Promise<void> {
  const { workspaceId, automationId, campaignName, overlaps, trigger } = params;
  if (overlaps.length === 0) return;

  try {
    const otherIds = [
      ...new Set(overlaps.flatMap((o) => o.campaigns.map((c) => c.id))),
    ];
    const keys = otherIds.map((id) => pairKey(automationId, id));

    const since = new Date(Date.now() - ALERT_THROTTLE_MS);
    const recent = await prisma.operationalEvent.findMany({
      where: {
        workspaceId,
        source: "SYSTEM",
        message: { in: keys },
        createdAt: { gte: since },
      },
      select: { message: true },
    });
    const alreadySent = new Set(recent.map((r) => r.message));
    const freshKeys = keys.filter((k) => !alreadySent.has(k));
    if (freshKeys.length === 0) return;

    // Report only the posts whose clash has not already been alerted on.
    const freshSet = new Set(freshKeys);
    const reportable = overlaps
      .map((o) => ({
        ...o,
        campaigns: o.campaigns.filter((c) => freshSet.has(pairKey(automationId, c.id))),
      }))
      .filter((o) => o.campaigns.length > 0);
    if (reportable.length === 0) return;

    // Record before sending: a send that fails should not queue up a retry
    // storm on every subsequent save.
    await prisma.operationalEvent.createMany({
      data: freshKeys.map((key) => ({
        workspaceId,
        source: "SYSTEM" as const,
        level: "WARNING" as const,
        message: key,
        payload: {
          kind: "campaign-overlap",
          trigger,
          automationId,
          campaignName,
          mediaIds: reportable.map((o) => o.mediaId),
        },
      })),
    });

    if (!isEmailConfigured()) return;

    const to = await recipientsFor(workspaceId);
    if (to.length === 0) return;

    const { subject, html, text } = renderEmail({
      campaignName,
      campaignId: automationId,
      overlaps: reportable,
      trigger,
    });
    await sendEmail({ to, subject, html, text });
  } catch (error) {
    console.error("[Overlap] Alert failed:", error);
  }
}
