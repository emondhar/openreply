import { redirect } from "next/navigation";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { getDiagnostics } from "@/lib/ops/diagnostics";
import DiagnosticsView from "./diagnostics-view";

export default async function DiagnosticsPage() {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) redirect("/login");

  const data = await getDiagnostics(workspaceId);

  return <DiagnosticsView initialData={data} />;
}
