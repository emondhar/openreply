import { redirect } from "next/navigation";
import DashboardShell from "@/components/dashboard-shell";
import { auth } from "@/lib/auth";
import {
  ensureWorkspaceForUser,
  getWorkspaceWithAccounts,
} from "@/lib/workspace";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  // One query for the workspace and its accounts, and no write path. This used
  // to call ensureWorkspaceForUser, which checks for pending invitations on
  // every dashboard render; that moved to the sign-in event, where it belongs.
  let membership = await getWorkspaceWithAccounts(session.user.id);

  if (!membership) {
    // Only reachable if the createUser event never ran for this account.
    const workspace = await ensureWorkspaceForUser(
      session.user.id,
      session.user.email
    );
    membership = {
      role: "OWNER",
      workspace: {
        id: workspace.id,
        name: workspace.name,
        dmsSentThisPeriod: workspace.dmsSentThisPeriod,
        instagramAccounts: [],
      },
    };
  }

  const { workspace } = membership;

  return (
    <DashboardShell
      workspaceName={workspace.name}
      instagramUsername={workspace.instagramAccounts[0]?.username ?? null}
      instagramAccountCount={workspace.instagramAccounts.length}
    >
      {children}
    </DashboardShell>
  );
}
