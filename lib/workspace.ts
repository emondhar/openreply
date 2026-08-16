import { cache } from "react";
import { prisma } from "@/lib/db/client";
import type { Workspace, WorkspaceRole } from "@/app/generated/prisma/client";

function normalizeInviteEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function acceptPendingInvitationsForUser(
  userId: string,
  email?: string | null
): Promise<void> {
  if (!email) return;

  const normalizedEmail = normalizeInviteEmail(email);
  const now = new Date();
  const invitations = await prisma.workspaceInvitation.findMany({
    where: {
      email: normalizedEmail,
      status: "PENDING",
      expiresAt: { gt: now },
    },
  });

  for (const invitation of invitations) {
    await prisma.$transaction([
      prisma.workspaceMember.upsert({
        where: {
          workspaceId_userId: {
            workspaceId: invitation.workspaceId,
            userId,
          },
        },
        create: {
          workspaceId: invitation.workspaceId,
          userId,
          role: invitation.role,
        },
        update: {
          role: invitation.role,
        },
      }),
      prisma.workspaceInvitation.update({
        where: { id: invitation.id },
        data: {
          status: "ACCEPTED",
          acceptedAt: now,
        },
      }),
    ]);
  }
}

export const getWorkspaceMembership = cache(
  async (
    userId: string
  ): Promise<{ workspace: Workspace; role: WorkspaceRole } | null> => {
    const membership = await prisma.workspaceMember.findFirst({
      where: { userId },
      include: { workspace: true },
      orderBy: { createdAt: "asc" },
    });

    if (!membership) return null;

    return {
      workspace: membership.workspace,
      role: membership.role,
    };
  }
);

export async function ensureWorkspaceForUser(
  userId: string,
  email?: string | null
): Promise<Workspace> {
  await acceptPendingInvitationsForUser(userId, email);

  const existingMembership = await getWorkspaceMembership(userId);
  if (existingMembership) {
    return existingMembership.workspace;
  }

  const workspaceName = email ? `${email.split("@")[0]}'s workspace` : "My workspace";

  return prisma.workspace.create({
    data: {
      name: workspaceName,
      ownerId: userId,
      members: {
        create: {
          userId,
          role: "OWNER",
        },
      },
    },
  });
}

export const getPrimaryWorkspace = cache(
  async (userId: string): Promise<Workspace | null> => {
    const membership = await getWorkspaceMembership(userId);
    return membership?.workspace ?? null;
  }
);

export type WorkspaceAccount = {
  id: string;
  username: string;
  instagramId: string;
  name: string | null;
};

/**
 * The workspace and its connected Instagram accounts in a single query.
 *
 * The dashboard layout needs both on every render. It used to take three
 * sequential round trips to get them — session, membership, accounts — with
 * an invitation-acceptance write path wedged in the middle. Cached per
 * request, so a page under the layout that also needs the account list reuses
 * this rather than issuing its own.
 */
export const getWorkspaceWithAccounts = cache(async (userId: string) => {
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: {
      role: true,
      workspace: {
        select: {
          id: true,
          name: true,
          dmsSentThisPeriod: true,
          instagramAccounts: {
            orderBy: { connectedAt: "desc" },
            select: {
              id: true,
              username: true,
              instagramId: true,
              name: true,
            },
          },
        },
      },
    },
  });

  return membership;
});
