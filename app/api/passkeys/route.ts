import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";

export const runtime = "nodejs";

/**
 * Passkeys belong to a User rather than a workspace, so everything here is
 * scoped by the session's user id. Registration itself is handled by Auth.js at
 * /api/auth/webauthn-options + /api/auth/callback/passkey; this route only
 * lists, renames, and revokes what that flow created.
 */

const credentialSchema = z.object({
  credentialID: z.string().min(1),
});

const renameSchema = credentialSchema.extend({
  name: z.string().trim().min(1).max(60),
});

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const passkeys = await prisma.authenticator.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    // credentialPublicKey and counter are deliberately not selected — the
    // browser never needs them and they should not leave the server.
    select: {
      credentialID: true,
      name: true,
      createdAt: true,
      credentialDeviceType: true,
      credentialBackedUp: true,
    },
  });

  return NextResponse.json({ success: true, data: { passkeys } });
}

export async function PATCH(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const parsed = renameSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "A credential id and a name are required" },
      { status: 400 }
    );
  }

  // Matched on userId as well as credentialID so a caller cannot rename a
  // passkey belonging to somebody else by guessing its id.
  const result = await prisma.authenticator.updateMany({
    where: { userId, credentialID: parsed.data.credentialID },
    data: { name: parsed.data.name },
  });

  if (result.count === 0) {
    return NextResponse.json(
      { success: false, error: "Passkey not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const parsed = credentialSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "A credential id is required" },
      { status: 400 }
    );
  }

  // Removing the last passkey is allowed on purpose: the Resend magic link is
  // always available as a fallback, so this cannot lock anyone out.
  const result = await prisma.authenticator.deleteMany({
    where: { userId, credentialID: parsed.data.credentialID },
  });

  if (result.count === 0) {
    return NextResponse.json(
      { success: false, error: "Passkey not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true });
}
