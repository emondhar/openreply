import { cache } from "react";
import { prisma } from "@/lib/db/client";

export type SettingsData = {
  workspace: { name: string; dmsSentThisPeriod: number };
  instagramAccounts: Array<{
    id: string;
    username: string;
    instagramId: string;
    name: string | null;
    tokenExpiresAt: string | null;
    webhookSubscribed: boolean;
  }>;
};

/**
 * Exactly what the settings page renders: the workspace's usage line and its
 * connected accounts.
 *
 * The page used to get this from /api/dashboard/stats — a twenty-plus query
 * analytics sweep — to read a name and a list. This is one query.
 */
export const getSettingsData = cache(
  async (workspaceId: string): Promise<SettingsData> => {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        name: true,
        dmsSentThisPeriod: true,
        instagramAccounts: {
          orderBy: { connectedAt: "desc" },
          select: {
            id: true,
            username: true,
            instagramId: true,
            name: true,
            tokenExpiresAt: true,
            webhookSubscribed: true,
          },
        },
      },
    });

    return {
      workspace: {
        name: workspace?.name ?? "Workspace",
        dmsSentThisPeriod: workspace?.dmsSentThisPeriod ?? 0,
      },
      instagramAccounts: (workspace?.instagramAccounts ?? []).map((account) => ({
        ...account,
        tokenExpiresAt: account.tokenExpiresAt?.toISOString() ?? null,
      })),
    };
  }
);
