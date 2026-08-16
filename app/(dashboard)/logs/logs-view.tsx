"use client";

/**
 * DM Logs
 *
 * Filterable, paginated table of DM logs.
 *
 * Filters and pagination live in the URL rather than in component state, so
 * the back button works, a filtered view can be linked or reloaded, and the
 * server renders each state directly. useTransition keeps the current table on
 * screen while the next one loads instead of blanking it.
 */

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import AccountSelect, { type AccountOption } from "@/components/account-select";
import StatusBadge from "@/components/status-badge";
import type { LogsPage } from "@/lib/logs/data";

const STATUS_FILTERS = [
  "ALL",
  "SENT",
  "FAILED",
  "PENDING",
  "SKIPPED_RATE_LIMIT",
  "SKIPPED_PLAN_LIMIT",
  "SKIPPED_DEDUP",
];

export default function LogsView({
  data,
  accounts,
  statusFilter,
  selectedAccountId,
}: {
  data: LogsPage;
  accounts: AccountOption[];
  statusFilter: string;
  selectedAccountId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const { logs, pagination } = data;

  function navigate(changes: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === "all" || value === "ALL") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    startTransition(() => {
      router.replace(`${pathname}${params.size ? `?${params}` : ""}`, {
        scroll: false,
      });
    });
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((status) => {
            const isActive = statusFilter === status;
            return (
              <button
                key={status}
                onClick={() => navigate({ status, page: null })}
                aria-pressed={isActive}
                className={`
                  px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                  active:scale-[0.97]
                  ${
                    isActive
                      ? "bg-accent/15 text-accent border border-accent/20"
                      : "bg-surface text-muted border border-border hover:border-border-hover hover:text-foreground"
                  }
                `}
              >
                {status === "ALL"
                  ? "All"
                  : status.replace("SKIPPED_", "").replace("_", " ")}
              </button>
            );
          })}
        </div>
        {accounts.length > 1 && (
          <AccountSelect
            accounts={accounts}
            value={selectedAccountId}
            onChange={(accountId) =>
              navigate({ instagramAccountId: accountId, page: null })
            }
          />
        )}
      </div>

      {/* Table */}
      <div
        className={`panel rounded overflow-hidden transition-opacity duration-150 ${
          isPending ? "opacity-60" : "opacity-100"
        }`}
      >
        {/* Six columns don't fit a phone; the table keeps its width and scrolls
            horizontally inside the panel rather than crushing every cell. */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-4 text-xs font-semibold text-muted uppercase tracking-wider sm:px-6">Commenter</th>
                <th className="px-4 py-4 text-xs font-semibold text-muted uppercase tracking-wider sm:px-6">Comment</th>
                <th className="px-4 py-4 text-xs font-semibold text-muted uppercase tracking-wider sm:px-6">Campaign</th>
                <th className="px-4 py-4 text-xs font-semibold text-muted uppercase tracking-wider sm:px-6">Account</th>
                <th className="px-4 py-4 text-xs font-semibold text-muted uppercase tracking-wider sm:px-6">Status</th>
                <th className="px-4 py-4 text-xs font-semibold text-muted uppercase tracking-wider sm:px-6">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {logs.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-12 text-center text-muted sm:px-6"
                  >
                    No logs found
                  </td>
                </tr>
              )}
              {logs.map((log) => (
                <tr
                  key={log.id}
                  className="hover:bg-surface-hover/50 transition-colors"
                >
                  <td className="px-4 py-4 sm:px-6">
                    <span className="font-medium text-foreground">
                      @{log.commenterName ?? log.commenterId.slice(0, 8)}
                    </span>
                  </td>
                  <td className="px-4 py-4 max-w-[200px] sm:px-6">
                    <span className="text-muted truncate block">
                      {log.commentText}
                    </span>
                  </td>
                  <td className="px-4 py-4 sm:px-6">
                    <span className="text-muted">{log.automation.name}</span>
                  </td>
                  <td className="px-4 py-4 sm:px-6">
                    <span className="text-muted">
                      @{log.instagramAccount.username}
                    </span>
                  </td>
                  <td className="px-4 py-4 sm:px-6">
                    <StatusBadge status={log.status} />
                  </td>
                  <td className="px-4 py-4 text-muted whitespace-nowrap tabular-nums sm:px-6">
                    {new Date(log.createdAt).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 border-t border-border sm:px-6">
            <p className="text-xs text-muted tabular-nums">
              Showing {(pagination.page - 1) * pagination.limit + 1}–
              {Math.min(pagination.page * pagination.limit, pagination.total)} of{" "}
              {pagination.total}
            </p>
            <div className="flex items-center gap-2">
              <button
                disabled={pagination.page <= 1}
                onClick={() =>
                  navigate({ page: String(pagination.page - 1) })
                }
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-muted border border-border hover:text-foreground hover:border-border-hover transition-all active:scale-[0.97] disabled:opacity-30 disabled:pointer-events-none"
              >
                Previous
              </button>
              <span className="text-xs text-muted px-2 tabular-nums">
                {pagination.page} / {pagination.totalPages}
              </span>
              <button
                disabled={pagination.page >= pagination.totalPages}
                onClick={() =>
                  navigate({ page: String(pagination.page + 1) })
                }
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-muted border border-border hover:text-foreground hover:border-border-hover transition-all active:scale-[0.97] disabled:opacity-30 disabled:pointer-events-none"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
