import { cache } from "react";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/client";
import {
  calculateCtr,
  normalizeTopKeywords,
  summarizeDmStatuses,
} from "@/lib/tracking/analytics";

/**
 * The dashboard aggregation, callable from a server component or a route
 * handler.
 *
 * It used to live only behind /api/dashboard/stats, which meant every page
 * that wanted it paid an HTTP round trip and a second session resolution to
 * get at data the server already had. Pages now call this directly and the
 * route handler is a thin wrapper for the client-side refetches that remain.
 *
 * Cached per request, so a page rendering this alongside other server work
 * runs it once.
 */
export const getDashboardStats = cache(
  async (workspaceId: string, userId: string | null, accountId?: string | null) => {
    const selectedAccountId =
      accountId && accountId !== "all" ? accountId : null;
    const accountFilter = selectedAccountId
      ? { instagramAccountId: selectedAccountId }
      : {};

    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // The daily chart window: seven local midnights ending at tomorrow's.
    const chartStart = new Date(todayStart);
    chartStart.setDate(chartStart.getDate() - 6);

    const accountSql = selectedAccountId
      ? Prisma.sql`AND "instagramAccountId" = ${selectedAccountId}`
      : Prisma.empty;

    const [
      workspace,
      instagramAccount,
      instagramAccounts,
      totalAutomations,
      activeAutomations,
      dmsSentToday,
      dmsSentWeek,
      dmsSentMonth,
      totalDMs,
      dmStatusCountsThisMonth,
      clicksThisMonth,
      totalClicks,
      topKeywordRows,
      recentLogs,
      user,
      contactCountRows,
      chartRows,
    ] = await Promise.all([
      prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: {
          name: true,
          dmsSentThisPeriod: true,
        },
      }),
      prisma.instagramAccount.findFirst({
        where: { workspaceId },
        orderBy: { connectedAt: "desc" },
        select: {
          id: true,
          username: true,
          instagramId: true,
          tokenExpiresAt: true,
          webhookSubscribed: true,
        },
      }),
      prisma.instagramAccount.findMany({
        where: { workspaceId },
        orderBy: { connectedAt: "desc" },
        select: {
          id: true,
          username: true,
          instagramId: true,
          name: true,
          tokenExpiresAt: true,
          webhookSubscribed: true,
        },
      }),
      prisma.automation.count({ where: { workspaceId, ...accountFilter } }),
      prisma.automation.count({
        where: { workspaceId, isActive: true, ...accountFilter },
      }),
      prisma.dmLog.count({
        where: {
          workspaceId,
          status: "SENT",
          createdAt: { gte: todayStart },
          ...accountFilter,
        },
      }),
      prisma.dmLog.count({
        where: {
          workspaceId,
          status: "SENT",
          createdAt: { gte: weekStart },
          ...accountFilter,
        },
      }),
      prisma.dmLog.count({
        where: {
          workspaceId,
          status: "SENT",
          createdAt: { gte: monthStart },
          ...accountFilter,
        },
      }),
      prisma.dmLog.count({
        where: { workspaceId, status: "SENT", ...accountFilter },
      }),
      prisma.dmLog.groupBy({
        by: ["status"],
        where: { workspaceId, createdAt: { gte: monthStart }, ...accountFilter },
        _count: { _all: true },
      }),
      prisma.linkClick.count({
        where: { workspaceId, createdAt: { gte: monthStart }, ...accountFilter },
      }),
      prisma.linkClick.count({ where: { workspaceId, ...accountFilter } }),
      prisma.dmLog.groupBy({
        by: ["matchedKeyword"],
        where: {
          workspaceId,
          matchedKeyword: { not: null },
          ...accountFilter,
        },
        _count: { _all: true },
      }),
      prisma.dmLog.findMany({
        where: { workspaceId, ...accountFilter },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          automation: { select: { name: true } },
          instagramAccount: { select: { username: true } },
        },
      }),
      userId
        ? prisma.user.findUnique({
            where: { id: userId },
            select: { name: true, email: true },
          })
        : Promise.resolve(null),
      // Distinct people who have interacted, counted as "contacts". This used
      // to select every DmLog row in the workspace and call .length on the
      // result — the whole table over the wire to produce one integer.
      prisma.$queryRaw<{ count: number }[]>`
        SELECT COUNT(DISTINCT "commenterId")::int AS count
        FROM "DmLog"
        WHERE "workspaceId" = ${workspaceId} ${accountSql}
      `,
      // The seven-day chart. This was a for-loop issuing seven count() calls
      // strictly in sequence — seven round trips for one sparkline. Selecting
      // just the timestamps over a bounded window and bucketing them here is
      // one round trip, and keeps the local-midnight day boundaries the rest
      // of this function uses (date_trunc would bucket in UTC).
      prisma.dmLog.findMany({
        where: {
          workspaceId,
          status: "SENT",
          createdAt: { gte: chartStart },
          ...accountFilter,
        },
        select: { createdAt: true },
      }),
    ]);

    const buckets = new Map<string, number>();
    for (const row of chartRows) {
      const key = new Date(
        row.createdAt.getFullYear(),
        row.createdAt.getMonth(),
        row.createdAt.getDate()
      ).toDateString();
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }

    const dailyDMs: { date: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date(todayStart);
      dayStart.setDate(dayStart.getDate() - i);
      dailyDMs.push({
        date: dayStart.toLocaleDateString("en-US", { weekday: "short" }),
        count: buckets.get(dayStart.toDateString()) ?? 0,
      });
    }

    const monthlyStatusSummary = summarizeDmStatuses(
      dmStatusCountsThisMonth.map((row) => ({
        status: row.status,
        _count: row._count._all,
      }))
    );
    const topKeywords = normalizeTopKeywords(
      topKeywordRows.map((row) => ({
        matchedKeyword: row.matchedKeyword,
        _count: row._count._all,
      }))
    );

    const firstName =
      user?.name?.trim().split(/\s+/)[0] || user?.email?.split("@")[0] || null;

    // Dates are normalised to ISO strings here so the shape is identical
    // whether a page receives this directly from a server component or as JSON
    // from the route handler. Without it the two paths disagree — Date over
    // the RSC boundary, string over the wire — and the client has to handle
    // both.
    return {
      userName: firstName,
      contactsCount: contactCountRows[0]?.count ?? 0,
      workspace,
      instagramAccount: instagramAccount
        ? {
            ...instagramAccount,
            tokenExpiresAt: instagramAccount.tokenExpiresAt?.toISOString() ?? null,
          }
        : null,
      instagramAccounts: instagramAccounts.map((account) => ({
        ...account,
        tokenExpiresAt: account.tokenExpiresAt?.toISOString() ?? null,
      })),
      selectedInstagramAccountId: selectedAccountId,
      totalAutomations,
      activeAutomations,
      dmsSentToday,
      dmsSentWeek,
      dmsSentMonth,
      dmsSkippedMonth: monthlyStatusSummary.skipped,
      dmsFailedMonth: monthlyStatusSummary.failed,
      totalDMs,
      clicksThisMonth,
      totalClicks,
      ctrThisMonth: calculateCtr(clicksThisMonth, dmsSentMonth),
      topKeywords,
      dailyDMs,
      recentLogs: recentLogs.map((log) => ({
        id: log.id,
        commenterName: log.commenterName,
        commentText: log.commentText,
        status: log.status as string,
        createdAt: log.createdAt.toISOString(),
        automation: { name: log.automation.name },
        instagramAccount: log.instagramAccount
          ? { username: log.instagramAccount.username }
          : undefined,
      })),
    };
  }
);

export type DashboardStats = Awaited<ReturnType<typeof getDashboardStats>>;
