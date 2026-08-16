import { prisma } from "@/lib/db/client";
import {
  calculateCtr,
  normalizeTopKeywords,
  summarizeDmStatuses,
} from "@/lib/tracking/analytics";
import { buildReportUrl, isReportBranded } from "@/lib/reports/share";

function getHostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function getDayWindow(daysAgo: number) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - daysAgo);

  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return { start, end };
}

export async function getCampaignReportBySlug(shareSlug: string) {
  const automation = await prisma.automation.findFirst({
    where: {
      reportShareSlug: shareSlug,
      reportShareEnabled: true,
    },
    select: {
      id: true,
      workspaceId: true,
      name: true,
      goal: true,
      postUrl: true,
      keywords: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      reportShareSlug: true,
      workspace: {
        select: {
          name: true,
        },
      },
      instagramAccount: {
        select: {
          username: true,
        },
      },
      trackedLinks: {
        select: {
          id: true,
          slug: true,
          destinationUrl: true,
          _count: { select: { clicks: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!automation || !automation.reportShareSlug) {
    return null;
  }

  const [statusRows, clickCount, keywordRows, latestSentLog] =
    await Promise.all([
      prisma.dmLog.groupBy({
        by: ["status"],
        where: {
          workspaceId: automation.workspaceId,
          automationId: automation.id,
        },
        _count: { _all: true },
      }),
      prisma.linkClick.count({
        where: {
          workspaceId: automation.workspaceId,
          automationId: automation.id,
        },
      }),
      prisma.dmLog.groupBy({
        by: ["matchedKeyword"],
        where: {
          workspaceId: automation.workspaceId,
          automationId: automation.id,
          matchedKeyword: { not: null },
        },
        _count: { _all: true },
      }),
      prisma.dmLog.findFirst({
        where: {
          workspaceId: automation.workspaceId,
          automationId: automation.id,
          status: "SENT",
        },
        orderBy: { dmSentAt: "desc" },
        select: { dmSentAt: true, createdAt: true },
      }),
    ]);

  const statusSummary = summarizeDmStatuses(
    statusRows.map((row) => ({
      status: row.status,
      _count: row._count._all,
    }))
  );
  const topKeywords = normalizeTopKeywords(
    keywordRows.map((row) => ({
      matchedKeyword: row.matchedKeyword,
      _count: row._count._all,
    }))
  );
  // The seven-day chart. This was fourteen count() calls — a sent count and a
  // click count per day — on every view of a public report. Two bounded reads
  // bucketed here do the same job, and keep the local-midnight boundaries the
  // date labels imply (date_trunc would bucket in UTC).
  const chartStart = getDayWindow(6).start;
  const [sentRows, clickRows] = await Promise.all([
    prisma.dmLog.findMany({
      where: {
        workspaceId: automation.workspaceId,
        automationId: automation.id,
        status: "SENT",
        createdAt: { gte: chartStart },
      },
      select: { createdAt: true },
    }),
    prisma.linkClick.findMany({
      where: {
        workspaceId: automation.workspaceId,
        automationId: automation.id,
        createdAt: { gte: chartStart },
      },
      select: { createdAt: true },
    }),
  ]);

  const dayKey = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).toDateString();
  const countByDay = (rows: { createdAt: Date }[]) => {
    const buckets = new Map<string, number>();
    for (const row of rows) {
      const key = dayKey(row.createdAt);
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    return buckets;
  };
  const sentByDay = countByDay(sentRows);
  const clicksByDay = countByDay(clickRows);

  const daily = Array.from({ length: 7 }, (_, index) => {
    const { start } = getDayWindow(6 - index);
    const key = start.toDateString();
    return {
      date: start.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      sent: sentByDay.get(key) ?? 0,
      clicks: clicksByDay.get(key) ?? 0,
    };
  });

  return {
    shareSlug: automation.reportShareSlug,
    reportUrl: buildReportUrl(automation.reportShareSlug),
    generatedAt: new Date(),
    branded: isReportBranded(),
    workspace: {
      name: automation.workspace.name,
    },
    campaign: {
      name: automation.name,
      goal: automation.goal,
      postUrl: automation.postUrl,
      keywords: automation.keywords,
      isActive: automation.isActive,
      createdAt: automation.createdAt,
      updatedAt: automation.updatedAt,
      instagramUsername: automation.instagramAccount.username,
    },
    metrics: {
      sent: statusSummary.sent,
      skipped: statusSummary.skipped,
      failed: statusSummary.failed,
      clicks: clickCount,
      ctr: calculateCtr(clickCount, statusSummary.sent),
      latestSentAt: latestSentLog?.dmSentAt ?? latestSentLog?.createdAt ?? null,
    },
    topKeywords,
    daily,
    trackedLinks: automation.trackedLinks.map((link) => ({
      slug: link.slug,
      destinationHost: getHostname(link.destinationUrl),
      clicks: link._count.clicks,
    })),
  };
}
