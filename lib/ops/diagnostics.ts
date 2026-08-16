import { cache } from "react";
import { prisma } from "@/lib/db/client";
import { getDMQueue } from "@/lib/queue/client";
import { getWorkerAlerts, getWorkerHealth } from "@/lib/ops/worker-health";

/**
 * Everything the diagnostics screen reports on.
 *
 * The queue read is allowed to fail on its own rather than taking the page
 * with it. This page exists to be looked at when infrastructure is broken, so
 * "Redis is unreachable" has to be something it can *show* — putting the queue
 * read in the same all-or-nothing Promise.all as the database queries meant a
 * Redis outage rendered the entire diagnostics screen unavailable, exactly
 * when it was most needed. A null queueCounts is that signal.
 */
export const getDiagnostics = cache(async (workspaceId: string) => {
  const [
    queueCounts,
    workerHealth,
    workerAlerts,
    webhookFailures,
    dmFailures,
    tokenRefreshFailures,
    operationalEvents,
  ] = await Promise.all([
    getDMQueue()
      .getJobCounts("waiting", "active", "delayed", "failed")
      .catch((err: unknown) => {
        console.warn(
          "[Diagnostics] Queue unreachable:",
          err instanceof Error ? err.message : err
        );
        return null;
      }),
    getWorkerHealth(),
    getWorkerAlerts(10),
    prisma.webhookEvent.findMany({
      where: { workspaceId, status: "FAILED" },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        object: true,
        errorMessage: true,
        createdAt: true,
        processedAt: true,
      },
    }),
    prisma.dmLog.findMany({
      where: {
        workspaceId,
        status: {
          in: [
            "FAILED",
            "SKIPPED_RATE_LIMIT",
            "SKIPPED_PLAN_LIMIT",
            "SKIPPED_NO_MATCH",
          ],
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: {
        id: true,
        status: true,
        commentId: true,
        commentText: true,
        errorMessage: true,
        updatedAt: true,
        automation: { select: { name: true } },
      },
    }),
    prisma.operationalEvent.findMany({
      where: { workspaceId, source: "TOKEN_REFRESH", level: "ERROR" },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, message: true, createdAt: true, payload: true },
    }),
    prisma.operationalEvent.findMany({
      where: { OR: [{ workspaceId }, { workspaceId: null }] },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        source: true,
        level: true,
        message: true,
        createdAt: true,
        resolvedAt: true,
      },
    }),
  ]);

  // ISO strings, so the shape is identical whether the screen gets this
  // straight from the server component or as JSON from the refresh button.
  return {
    queueCounts,
    workerHealth,
    workerAlerts,
    webhookFailures: webhookFailures.map((event) => ({
      id: event.id,
      object: event.object,
      errorMessage: event.errorMessage,
      createdAt: event.createdAt.toISOString(),
    })),
    dmFailures: dmFailures.map((log) => ({
      id: log.id,
      status: log.status as string,
      commentId: log.commentId,
      commentText: log.commentText,
      errorMessage: log.errorMessage,
      updatedAt: log.updatedAt.toISOString(),
      automation: { name: log.automation.name },
    })),
    tokenRefreshFailures: tokenRefreshFailures.map((event) => ({
      id: event.id,
      message: event.message,
      createdAt: event.createdAt.toISOString(),
    })),
    operationalEvents: operationalEvents.map((event) => ({
      id: event.id,
      source: event.source as string,
      level: event.level as string,
      message: event.message,
      createdAt: event.createdAt.toISOString(),
      resolvedAt: event.resolvedAt?.toISOString() ?? null,
    })),
  };
});
