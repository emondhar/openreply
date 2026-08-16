import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/db/client";
import { insightsTag } from "@/lib/meta/insights-cache";
import {
  canManageWorkspace,
  getCurrentWorkspaceContext,
} from "@/lib/workspace-access";

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
      { success: false, error: "Only owners and admins can disconnect accounts" },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const instagramAccountId =
    typeof body.instagramAccountId === "string" ? body.instagramAccountId : null;

  // Capture the ids before deleting so their cached insights can be dropped —
  // otherwise a reconnect of the same account would read stale numbers from
  // entries whose TTL had not expired.
  const removed = await prisma.instagramAccount.findMany({
    where: {
      workspaceId: context.workspaceId,
      ...(instagramAccountId ? { id: instagramAccountId } : {}),
    },
    select: { id: true },
  });

  await prisma.instagramAccount.deleteMany({
    where: {
      workspaceId: context.workspaceId,
      ...(instagramAccountId ? { id: instagramAccountId } : {}),
    },
  });

  for (const account of removed) {
    // expire: 0 rather than the "max" stale-while-revalidate profile — the
    // account is gone, so serving its cached numbers even once more would be
    // wrong. (updateTag would say this more directly but is Server-Action
    // only; this is a route handler.)
    revalidateTag(insightsTag(account.id), { expire: 0 });
  }

  return NextResponse.json({ success: true });
}
