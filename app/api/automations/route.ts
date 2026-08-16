import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@/app/generated/prisma/client";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { getCampaigns } from "@/lib/campaigns/data";
import { prisma } from "@/lib/db/client";
import { generateTrackedLinkSlug } from "@/lib/tracking/server";
import { generateReportShareSlug } from "@/lib/reports/share";
import { postIdsSchema, postMetaSchema, syncCampaignPosts } from "@/lib/campaigns/posts";
import { postRuleSchema, ruleConditionsChanged, parsePostRule } from "@/lib/campaigns/post-rules";
import { findOverlaps, notifyOverlaps } from "@/lib/campaigns/overlap";
import {
  canManageWorkspace,
  getCurrentWorkspaceContext,
} from "@/lib/workspace-access";

// This list is read-your-writes (created/imported campaigns must show up
// immediately), so never cache it at the route or CDN layer. The responses
// also carry Cache-Control: private, no-store for the same reason.
export const dynamic = "force-dynamic";

const createAutomationSchema = z
  .object({
    name: z.string().min(1).max(100),
    goal: z.string().min(1).max(120).optional().nullable(),
    instagramAccountId: z.string().min(1).optional().nullable(),
    // Legacy single-post fields. Still accepted so the CSV importer and any
    // external caller keep working; normalized into postIds below.
    postId: z.string().min(1).optional().nullable(),
    postUrl: z.string().url().optional().nullable(),
    // The posts this campaign covers, picked by hand.
    postIds: postIdsSchema.optional().default([]),
    // Graph metadata the picker already had, cached so rendering a campaign
    // never needs to re-download the account's media list.
    postMeta: z.record(z.string(), postMetaSchema).optional().default({}),
    // Saved targeting rule that keeps enrolling matching posts. anchorAt is
    // stamped server-side, so callers omit it.
    postRule: postRuleSchema.omit({ anchorAt: true }).optional().nullable(),
    pendingNextReel: z.boolean().optional().default(false),
    matchAnyPost: z.boolean().optional().default(false),
    keywords: z.array(z.string().min(1).max(50)).max(10).optional().default([]),
    matchAnyWord: z.boolean().optional().default(false),
    dmTriggerEnabled: z.boolean().optional().default(false),
    dmMessage: z.string().min(1).max(1000),
    openingDmEnabled: z.boolean().optional().default(false),
    openingDmMessage: z.string().max(1000).optional().nullable(),
    openingDmButtonLabel: z.string().max(64).optional().nullable(),
    linkButtonLabel: z.string().max(20).optional().nullable(),
    requireFollow: z.boolean().optional().default(false),
    followPromptMessage: z.string().max(1000).optional().nullable(),
    followPromptButtonLabel: z.string().max(20).optional().nullable(),
    followUpEnabled: z.boolean().optional().default(false),
    followUpMessage: z.string().max(1000).optional().nullable(),
    // Minutes to wait before the follow-up. Capped at 24h so it stays inside
    // Instagram's messaging window.
    followUpDelayMinutes: z.number().int().min(0).max(1440).optional().default(0),
    publicReplyEnabled: z.boolean().optional().default(false),
    publicReplyMessage: z.string().max(1000).optional().nullable(),
    publicReplyMessages: z
      .array(z.string().max(1000))
      .max(10)
      .optional()
      .default([]),
    // Empty string means "no tracked link"; a URL sets one.
    trackedDestinationUrl: z
      .union([z.string().url(), z.literal("")])
      .optional()
      .nullable(),
    // Optional second tracked link, rendered as a second DM button.
    secondaryDestinationUrl: z
      .union([z.string().url(), z.literal("")])
      .optional()
      .nullable(),
    secondaryButtonLabel: z.string().max(20).optional().nullable(),
    isActive: z.boolean().optional().default(true),
    wholeWordMatch: z.boolean().optional().default(true),
  })
  // A campaign must target some posts, a rule, any post, or the next reel.
  .refine(
    (d) =>
      d.matchAnyPost ||
      d.pendingNextReel ||
      Boolean(d.postId) ||
      d.postIds.length > 0 ||
      Boolean(d.postRule),
    { message: "Choose which post(s) trigger the campaign", path: ["postIds"] }
  )
  // And it must match either specific words or any word.
  .refine((d) => d.matchAnyWord || d.keywords.length >= 1, {
    message: "Add at least one keyword, or match any word",
    path: ["keywords"],
  })
  // An opening DM needs both a message and a button label.
  .refine(
    (d) =>
      !d.openingDmEnabled ||
      (Boolean(d.openingDmMessage?.trim()) &&
        Boolean(d.openingDmButtonLabel?.trim())),
    { message: "Opening DM needs a message and a button label", path: ["openingDmMessage"] }
  );

const updateAutomationSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  goal: z.string().min(1).max(120).optional().nullable(),
  postId: z.string().min(1).optional().nullable(),
  postUrl: z.string().url().optional().nullable(),
  postIds: postIdsSchema.optional(),
  postMeta: z.record(z.string(), postMetaSchema).optional(),
  /** Drop these from the campaign, whatever added them. */
  excludePostIds: postIdsSchema.optional(),
  postRule: postRuleSchema.omit({ anchorAt: true }).optional().nullable(),
  pendingNextReel: z.boolean().optional(),
  matchAnyPost: z.boolean().optional(),
  keywords: z.array(z.string().min(1).max(50)).max(10).optional(),
  matchAnyWord: z.boolean().optional(),
  dmTriggerEnabled: z.boolean().optional(),
  dmMessage: z.string().min(1).max(1000).optional(),
  openingDmEnabled: z.boolean().optional(),
  openingDmMessage: z.string().max(1000).optional().nullable(),
  openingDmButtonLabel: z.string().max(64).optional().nullable(),
  linkButtonLabel: z.string().max(20).optional().nullable(),
  requireFollow: z.boolean().optional(),
  followPromptMessage: z.string().max(1000).optional().nullable(),
  followPromptButtonLabel: z.string().max(20).optional().nullable(),
  followUpEnabled: z.boolean().optional(),
  followUpMessage: z.string().max(1000).optional().nullable(),
  followUpDelayMinutes: z.number().int().min(0).max(1440).optional(),
  publicReplyEnabled: z.boolean().optional(),
  publicReplyMessage: z.string().max(1000).optional().nullable(),
  publicReplyMessages: z.array(z.string().max(1000)).max(10).optional(),
  isActive: z.boolean().optional(),
  wholeWordMatch: z.boolean().optional(),
  reportShareEnabled: z.boolean().optional(),
  // Empty string clears the tracked link; a URL updates/creates it; undefined
  // leaves it unchanged.
  trackedDestinationUrl: z
    .union([z.string().url(), z.literal("")])
    .optional()
    .nullable(),
  // Same semantics for the optional second tracked link / DM button.
  secondaryDestinationUrl: z
    .union([z.string().url(), z.literal("")])
    .optional()
    .nullable(),
  secondaryButtonLabel: z.string().max(20).optional().nullable(),
});

export async function GET(request: NextRequest) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const data = await getCampaigns(
    workspaceId,
    request.nextUrl.searchParams.get("instagramAccountId")
  );

  return NextResponse.json(
    { success: true, data },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function POST(request: NextRequest) {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  if (!canManageWorkspace(context.role)) {
    return NextResponse.json(
      { success: false, error: "Only owners and admins can create campaigns" },
      { status: 403 }
    );
  }

  const workspaceId = context.workspaceId;

  const body = await request.json();
  const parsed = createAutomationSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid input",
        details: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }

  const requestedInstagramAccountId =
    parsed.data.instagramAccountId && parsed.data.instagramAccountId !== "all"
      ? parsed.data.instagramAccountId
      : null;

  const [workspace, instagramAccount] = await Promise.all([
    prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true },
    }),
    requestedInstagramAccountId
      ? prisma.instagramAccount.findFirst({
          where: { id: requestedInstagramAccountId, workspaceId },
        })
      : prisma.instagramAccount.findFirst({
          where: { workspaceId },
          orderBy: { connectedAt: "desc" },
        }),
  ]);

  if (!workspace) {
    return NextResponse.json(
      { success: false, error: "Workspace not found" },
      { status: 404 }
    );
  }

  if (!instagramAccount) {
    return NextResponse.json(
      { success: false, error: "Connect Instagram before creating campaigns" },
      { status: 400 }
    );
  }

  const { trackedDestinationUrl, secondaryDestinationUrl, secondaryButtonLabel } =
    parsed.data;

  // The primary link's button title comes from `linkButtonLabel`; the second
  // link stores its own button title in the tracked link's `label` field.
  const linkCreates: {
    workspaceId: string;
    slug: string;
    label: string;
    destinationUrl: string;
  }[] = [];
  if (trackedDestinationUrl) {
    linkCreates.push({
      workspaceId,
      slug: generateTrackedLinkSlug(),
      label: "Primary campaign link",
      destinationUrl: trackedDestinationUrl,
    });
  }
  if (secondaryDestinationUrl) {
    linkCreates.push({
      workspaceId,
      slug: generateTrackedLinkSlug(),
      label: secondaryButtonLabel?.trim() || "Open link",
      destinationUrl: secondaryDestinationUrl,
    });
  }

  const { pendingNextReel, matchAnyPost, matchAnyWord, openingDmEnabled } =
    parsed.data;
  // Posts are only stored for the "specific posts" trigger.
  const isSpecificPost = !pendingNextReel && !matchAnyPost;
  // `postId` is the legacy single-post field; fold it into the set so old
  // callers (the CSV importer) behave identically to the picker.
  const selectedPostIds = isSpecificPost
    ? [
        ...new Set(
          [...parsed.data.postIds, parsed.data.postId].filter(
            (id): id is string => Boolean(id)
          )
        ),
      ]
    : [];
  const postMeta = { ...parsed.data.postMeta };
  if (parsed.data.postId && parsed.data.postUrl && !postMeta[parsed.data.postId]) {
    postMeta[parsed.data.postId] = { permalink: parsed.data.postUrl };
  }
  // A rule only makes sense alongside a real post set, not a catch-all.
  const postRule =
    isSpecificPost && parsed.data.postRule
      ? { ...parsed.data.postRule, anchorAt: new Date().toISOString() }
      : null;
  const publicReplyList = (
    parsed.data.publicReplyMessages.length > 0
      ? parsed.data.publicReplyMessages
      : parsed.data.publicReplyMessage
        ? [parsed.data.publicReplyMessage]
        : []
  )
    .map((m) => m.trim())
    .filter(Boolean);

  const automation = await prisma.automation.create({
    data: {
      name: parsed.data.name,
      goal: parsed.data.goal,
      // Mirror of the primary post, rewritten from the real set right after
      // create. A next-reel campaign has no post yet; the cron binds one once a
      // reel is posted.
      postId: null,
      postUrl: null,
      postRule: postRule ?? undefined,
      pendingNextReel,
      matchAnyPost,
      keywords: matchAnyWord ? [] : parsed.data.keywords,
      matchAnyWord,
      dmTriggerEnabled: parsed.data.dmTriggerEnabled,
      dmMessage: parsed.data.dmMessage,
      openingDmEnabled,
      openingDmMessage: openingDmEnabled
        ? parsed.data.openingDmMessage || null
        : null,
      openingDmButtonLabel: openingDmEnabled
        ? parsed.data.openingDmButtonLabel || null
        : null,
      linkButtonLabel: parsed.data.linkButtonLabel || null,
      requireFollow: parsed.data.requireFollow,
      followPromptMessage: parsed.data.requireFollow
        ? parsed.data.followPromptMessage || null
        : null,
      followPromptButtonLabel: parsed.data.requireFollow
        ? parsed.data.followPromptButtonLabel || null
        : null,
      followUpEnabled: parsed.data.followUpEnabled,
      followUpMessage: parsed.data.followUpEnabled
        ? parsed.data.followUpMessage || null
        : null,
      followUpDelayMinutes: parsed.data.followUpEnabled
        ? parsed.data.followUpDelayMinutes
        : 0,
      publicReplyEnabled: parsed.data.publicReplyEnabled,
      publicReplyMessages: parsed.data.publicReplyEnabled
        ? publicReplyList
        : [],
      publicReplyMessage: parsed.data.publicReplyEnabled
        ? publicReplyList[0] ?? parsed.data.publicReplyMessage ?? null
        : null,
      isActive: parsed.data.isActive,
      wholeWordMatch: parsed.data.wholeWordMatch,
      workspaceId,
      instagramAccountId: instagramAccount.id,
      reportShareSlug: generateReportShareSlug(),
      ...(linkCreates.length > 0
        ? { trackedLinks: { create: linkCreates } }
        : {}),
    },
    include: {
      trackedLinks: true,
    },
  });

  const synced = await syncCampaignPosts({
    automationId: automation.id,
    postIds: selectedPostIds,
    postMeta,
  });

  // Keep the legacy mirror pointing at the primary post.
  if (synced.primary.postId) {
    await prisma.automation.update({
      where: { id: automation.id },
      data: synced.primary,
    });
  }

  // Instagram allows one private reply per comment, ever — so a post covered by
  // two campaigns means one of them will quietly stop sending. Surface it
  // rather than letting the owner discover it in the logs.
  const overlaps = await findOverlaps({
    instagramAccountId: instagramAccount.id,
    automationId: automation.id,
    mediaIds: synced.mediaIds,
  });
  await notifyOverlaps({
    workspaceId,
    automationId: automation.id,
    campaignName: automation.name,
    overlaps,
    trigger: "save",
  });

  return NextResponse.json(
    {
      success: true,
      data: { ...automation, ...synced.primary, postIds: synced.mediaIds },
      overlaps,
    },
    { status: 201 }
  );
}

export async function PATCH(request: NextRequest) {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  if (!canManageWorkspace(context.role)) {
    return NextResponse.json(
      { success: false, error: "Only owners and admins can update campaigns" },
      { status: 403 }
    );
  }

  const workspaceId = context.workspaceId;

  const automationId = request.nextUrl.searchParams.get("id");
  if (!automationId) {
    return NextResponse.json(
      { success: false, error: "Missing campaign ID" },
      { status: 400 }
    );
  }

  const body = await request.json();
  const parsed = updateAutomationSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid input",
        details: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }

  const existing = await prisma.automation.findFirst({
    where: { id: automationId, workspaceId },
  });

  if (!existing) {
    return NextResponse.json(
      { success: false, error: "Campaign not found" },
      { status: 404 }
    );
  }

  const {
    trackedDestinationUrl,
    secondaryDestinationUrl,
    secondaryButtonLabel,
    // The post set lives in AutomationPost rows, not on the automation.
    postIds,
    postMeta,
    excludePostIds,
    postRule,
    ...automationData
  } = parsed.data;

  // Keep dependent fields consistent: any-word clears keywords; a disabled
  // opening DM clears its message and button.
  if (automationData.matchAnyWord === true) automationData.keywords = [];
  if (automationData.openingDmEnabled === false) {
    automationData.openingDmMessage = null;
    automationData.openingDmButtonLabel = null;
  }
  if (automationData.requireFollow === false) {
    automationData.followPromptMessage = null;
    automationData.followPromptButtonLabel = null;
  }
  if (automationData.followUpEnabled === false) {
    automationData.followUpMessage = null;
    automationData.followUpDelayMinutes = 0;
  }
  // Any-post / next-reel campaigns carry no specific posts. Clear the whole set,
  // not just the legacy mirror, or the campaign would keep matching them.
  const clearPosts =
    automationData.matchAnyPost === true || automationData.pendingNextReel === true;
  if (clearPosts) {
    automationData.postId = null;
    automationData.postUrl = null;
  }

  // Re-stamp the rule's anchor only when its conditions actually changed.
  // Editing an unrelated field must not move a "future posts only" cutoff
  // forward and orphan everything it had already enrolled.
  let nextRule: Prisma.InputJsonValue | typeof Prisma.DbNull | undefined;
  if (postRule !== undefined) {
    if (postRule === null || clearPosts) {
      nextRule = Prisma.DbNull;
    } else {
      const current = parsePostRule(existing.postRule);
      const candidate = { ...postRule, anchorAt: current?.anchorAt ?? new Date().toISOString() };
      nextRule = ruleConditionsChanged(current, candidate)
        ? { ...candidate, anchorAt: new Date().toISOString() }
        : candidate;
    }
  }
  // Keep the public-reply variations list and the legacy single field in sync.
  if (automationData.publicReplyMessages !== undefined) {
    const list = automationData.publicReplyMessages
      .map((m) => m.trim())
      .filter(Boolean);
    automationData.publicReplyMessages = list;
    automationData.publicReplyMessage = list[0] ?? null;
  }
  if (automationData.publicReplyEnabled === false) {
    automationData.publicReplyMessages = [];
    automationData.publicReplyMessage = null;
  }

  const updated = await prisma.automation.update({
    where: { id: automationId },
    data: {
      ...automationData,
      ...(nextRule !== undefined ? { postRule: nextRule } : {}),
    },
  });

  // Reconcile the post set. Switching to any-post/next-reel drops every post;
  // otherwise an omitted postIds means "leave the set alone".
  let overlaps: Awaited<ReturnType<typeof findOverlaps>> = [];
  if (clearPosts) {
    await prisma.automationPost.deleteMany({ where: { automationId } });
  } else if (postIds !== undefined || excludePostIds !== undefined) {
    const existingManual = await prisma.automationPost.findMany({
      where: { automationId, source: "MANUAL" },
      select: { mediaId: true },
    });
    const synced = await syncCampaignPosts({
      automationId,
      postIds: postIds ?? existingManual.map((r) => r.mediaId),
      postMeta,
      excludePostIds,
    });
    await prisma.automation.update({
      where: { id: automationId },
      data: synced.primary,
    });

    if (synced.added.length > 0) {
      overlaps = await findOverlaps({
        instagramAccountId: existing.instagramAccountId,
        automationId,
        mediaIds: synced.added,
      });
      await notifyOverlaps({
        workspaceId,
        automationId,
        campaignName: updated.name,
        overlaps,
        trigger: "save",
      });
    }
  }

  // Update, create, or clear the campaign's primary tracked link when a
  // destination URL was supplied. `undefined` means "leave it alone".
  if (trackedDestinationUrl !== undefined && trackedDestinationUrl !== null) {
    const primaryLink = await prisma.trackedLink.findFirst({
      where: { automationId },
      orderBy: { createdAt: "asc" },
    });

    if (trackedDestinationUrl === "") {
      if (primaryLink) {
        await prisma.trackedLink.delete({ where: { id: primaryLink.id } });
      }
    } else if (primaryLink) {
      await prisma.trackedLink.update({
        where: { id: primaryLink.id },
        data: { destinationUrl: trackedDestinationUrl },
      });
    } else {
      await prisma.trackedLink.create({
        data: {
          workspaceId,
          automationId,
          slug: generateTrackedLinkSlug(),
          label: "Primary campaign link",
          destinationUrl: trackedDestinationUrl,
        },
      });
    }
  }

  // Update, create, or clear the campaign's second tracked link. It is always
  // the link at index [1] (ordered by createdAt), and its `label` holds the
  // second button's title.
  if (secondaryDestinationUrl !== undefined && secondaryDestinationUrl !== null) {
    const links = await prisma.trackedLink.findMany({
      where: { automationId },
      orderBy: { createdAt: "asc" },
    });
    const secondaryLink = links[1];
    const secondaryLabel = secondaryButtonLabel?.trim() || "Open link";

    if (secondaryDestinationUrl === "") {
      if (secondaryLink) {
        await prisma.trackedLink.delete({ where: { id: secondaryLink.id } });
      }
    } else if (secondaryLink) {
      await prisma.trackedLink.update({
        where: { id: secondaryLink.id },
        data: { destinationUrl: secondaryDestinationUrl, label: secondaryLabel },
      });
    } else {
      await prisma.trackedLink.create({
        data: {
          workspaceId,
          automationId,
          slug: generateTrackedLinkSlug(),
          label: secondaryLabel,
          destinationUrl: secondaryDestinationUrl,
        },
      });
    }
  }

  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(request: NextRequest) {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  if (!canManageWorkspace(context.role)) {
    return NextResponse.json(
      { success: false, error: "Only owners and admins can delete campaigns" },
      { status: 403 }
    );
  }

  const workspaceId = context.workspaceId;

  const automationId = request.nextUrl.searchParams.get("id");
  if (!automationId) {
    return NextResponse.json(
      { success: false, error: "Missing campaign ID" },
      { status: 400 }
    );
  }

  const existing = await prisma.automation.findFirst({
    where: { id: automationId, workspaceId },
  });

  if (!existing) {
    return NextResponse.json(
      { success: false, error: "Campaign not found" },
      { status: 404 }
    );
  }

  await prisma.automation.delete({ where: { id: automationId } });

  return NextResponse.json({ success: true, data: { deleted: true } });
}
