import { cache } from "react";
import { prisma } from "@/lib/db/client";
import { buildInvitationUrl } from "@/lib/workspace-invitations";
import type { WorkspaceRole } from "@/app/generated/prisma/client";

export type WorkspaceMembersData = {
  currentUserRole?: WorkspaceRole;
  members: Array<{
    id: string;
    role: WorkspaceRole;
    createdAt: string;
    user: { id: string; email: string | null; name: string | null };
  }>;
  invitations: Array<{
    id: string;
    email: string;
    role: WorkspaceRole;
    inviteUrl: string;
    expiresAt: string;
  }>;
};

/**
 * Members and pending invitations for a workspace.
 *
 * Extracted from the route handler so the settings page can render it on the
 * server. Dates are ISO strings so the shape is identical whether it arrives
 * over the RSC boundary or as JSON.
 */
export const getWorkspaceMembers = cache(
  async (
    workspaceId: string,
    currentUserRole?: WorkspaceRole
  ): Promise<WorkspaceMembersData> => {
    const [members, invitations] = await Promise.all([
      prisma.workspaceMember.findMany({
        where: { workspaceId },
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          role: true,
          createdAt: true,
          user: { select: { id: true, email: true, name: true } },
        },
      }),
      prisma.workspaceInvitation.findMany({
        where: { workspaceId, status: "PENDING" },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          email: true,
          role: true,
          token: true,
          expiresAt: true,
        },
      }),
    ]);

    return {
      ...(currentUserRole ? { currentUserRole } : {}),
      members: members.map((member) => ({
        id: member.id,
        role: member.role,
        createdAt: member.createdAt.toISOString(),
        user: member.user,
      })),
      invitations: invitations.map((invitation) => ({
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        inviteUrl: buildInvitationUrl(invitation.token),
        expiresAt: invitation.expiresAt.toISOString(),
      })),
    };
  }
);
