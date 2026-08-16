import { cache } from "react";
import NextAuth, { type NextAuthConfig } from "next-auth";
import Resend from "next-auth/providers/resend";
import Passkey from "next-auth/providers/passkey";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db/client";
import {
  acceptPendingInvitationsForUser,
  ensureWorkspaceForUser,
  getPrimaryWorkspace,
} from "@/lib/workspace";
import { isEmailAllowedToSignIn } from "@/lib/env";

type AdapterPrismaClient = Parameters<typeof PrismaAdapter>[0];

export const authConfig = {
  adapter: PrismaAdapter(prisma as unknown as AdapterPrismaClient),
  providers: [
    Resend({
      apiKey: process.env.RESEND_API_KEY ?? "missing-resend-api-key",
      from: process.env.EMAIL_FROM ?? "OpenReply <login@example.com>",
    }),
    // Kept alongside Resend deliberately: a passkey can be lost with the device
    // that holds it, and on an instance locked to one address via
    // AUTH_ALLOWED_EMAILS the magic link is the only way back in.
    Passkey,
  ],
  // Auth.js WebAuthn support is still experimental and must be opted into.
  experimental: { enableWebAuthn: true },
  callbacks: {
    // Runs before the magic link is sent, so a blocked address never receives
    // one and never reaches the adapter to have a User row created.
    async signIn({ user }) {
      return isEmailAllowedToSignIn(user.email);
    },
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
  events: {
    async createUser({ user }) {
      if (user.id) {
        await ensureWorkspaceForUser(user.id, user.email);
      }
    },
    // Pending invitations are claimed here rather than on every dashboard
    // render. An existing user invited by email is joined the next time they
    // sign in, and the /invite/[token] link joins them immediately — neither
    // path needs the read side of the app to carry a write.
    async signIn({ user, isNewUser }) {
      if (user.id && !isNewUser) {
        await acceptPendingInvitationsForUser(user.id, user.email);
      }
    },
  },
  pages: {
    signIn: "/login",
    verifyRequest: "/verify-request",
  },
  session: {
    strategy: "database",
  },
  trustHost: true,
  secret: process.env.NEXTAUTH_SECRET,
} satisfies NextAuthConfig;

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);

// Sessions use the database strategy, so every auth() call is a real query
// pair. These are the two things nearly every server component and route
// handler asks for first, and a single request used to resolve them several
// times over — /api/dashboard/stats alone resolved the session twice. React's
// cache() dedupes for the lifetime of one request, so the whole tree shares
// one resolution no matter how many helpers ask.
export const getCurrentUserId = cache(async (): Promise<string | null> => {
  const session = await auth();
  return session?.user?.id ?? null;
});

export const getCurrentWorkspaceId = cache(
  async (): Promise<string | null> => {
    const userId = await getCurrentUserId();
    if (!userId) return null;

    const workspace = await getPrimaryWorkspace(userId);
    if (workspace) return workspace.id;

    // Only reachable if the createUser event never ran (e.g. a row restored
    // from a backup). Creating the workspace here is the safety net, not the
    // normal path.
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    const createdWorkspace = await ensureWorkspaceForUser(userId, user?.email);
    return createdWorkspace.id;
  }
);
