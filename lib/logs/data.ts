import { cache } from "react";
import { DmStatus } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/client";

export const LOGS_PAGE_SIZE = 20;

export type DmLogRow = {
  id: string;
  commenterId: string;
  commenterName: string | null;
  commentText: string;
  status: string;
  errorMessage: string | null;
  createdAt: string;
  automation: { name: string; keywords: string[] };
  instagramAccount: { username: string };
};

export type LogsPage = {
  logs: DmLogRow[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

/** Coerce untrusted query values into the shape the query expects. */
export function parseLogsQuery(params: {
  page?: string | null;
  limit?: string | null;
  status?: string | null;
  instagramAccountId?: string | null;
}) {
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const limit = Math.min(
    50,
    Math.max(1, Number.parseInt(params.limit ?? String(LOGS_PAGE_SIZE), 10) || LOGS_PAGE_SIZE)
  );
  const status =
    params.status && Object.values(DmStatus).includes(params.status as DmStatus)
      ? (params.status as DmStatus)
      : null;
  const instagramAccountId =
    params.instagramAccountId && params.instagramAccountId !== "all"
      ? params.instagramAccountId
      : null;

  return { page, limit, status, instagramAccountId };
}

/**
 * One page of DM logs. Shared by the logs page (server component) and
 * /api/logs, so both return exactly the same shape and neither has to be the
 * source of truth for the other. Cached per request.
 */
export const getLogsPage = cache(
  async (
    workspaceId: string,
    query: ReturnType<typeof parseLogsQuery>
  ): Promise<LogsPage> => {
    const { page, limit, status, instagramAccountId } = query;

    const where = {
      workspaceId,
      ...(status ? { status } : {}),
      ...(instagramAccountId ? { instagramAccountId } : {}),
    };

    const [logs, total] = await Promise.all([
      prisma.dmLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          automation: { select: { name: true, keywords: true } },
          instagramAccount: { select: { username: true } },
        },
      }),
      prisma.dmLog.count({ where }),
    ]);

    return {
      logs: logs.map((log) => ({
        id: log.id,
        commenterId: log.commenterId,
        commenterName: log.commenterName,
        commentText: log.commentText,
        status: log.status as string,
        errorMessage: log.errorMessage,
        createdAt: log.createdAt.toISOString(),
        automation: {
          name: log.automation.name,
          keywords: log.automation.keywords,
        },
        instagramAccount: { username: log.instagramAccount.username },
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
);
