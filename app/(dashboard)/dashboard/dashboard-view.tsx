"use client";

/**
 * Dashboard Home
 *
 * Overview cards, 7-day chart, and recent activity feed.
 *
 * Data for the first paint arrives as a prop from the server component, so
 * there is no fetch-on-mount and no empty first render. The only fetch left is
 * the account filter, which is a user action and belongs in its handler rather
 * than an effect.
 */

import { useState } from "react";
import AccountSelect from "@/components/account-select";
import StatCard from "@/components/stat-card";
import StatusBadge from "@/components/status-badge";
import type { DashboardStats } from "@/lib/dashboard/stats";

export default function DashboardView({
  initialStats,
}: {
  initialStats: DashboardStats;
}) {
  const [stats, setStats] = useState(initialStats);
  const [selectedAccountId, setSelectedAccountId] = useState("all");
  const [refreshing, setRefreshing] = useState(false);

  async function handleAccountChange(accountId: string) {
    setSelectedAccountId(accountId);
    setRefreshing(true);
    try {
      const params = new URLSearchParams();
      if (accountId !== "all") params.set("instagramAccountId", accountId);
      const res = await fetch(
        `/api/dashboard/stats${params.size ? `?${params}` : ""}`
      );
      const data = await res.json();
      if (data.success) setStats(data.data);
    } catch (err) {
      console.error("Failed to load stats for account:", err);
    } finally {
      setRefreshing(false);
    }
  }

  const maxDM = Math.max(...stats.dailyDMs.map((d) => d.count), 1);
  const connectedCount = stats.instagramAccounts.length;

  return (
    // Dimmed rather than replaced while refreshing: the numbers on screen are
    // still the right shape and mostly the right values, and swapping them for
    // a skeleton would throw away a correct screen to show an empty one.
    <div
      className={`space-y-8 transition-opacity duration-150 ${
        refreshing ? "opacity-60" : "opacity-100"
      }`}
    >
      {/* Greeting header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Hello, {stats.userName ?? "there"}!
          </h1>
          <p className="mt-1 text-sm text-muted">
            {connectedCount} connected{" "}
            {connectedCount === 1 ? "account" : "accounts"}
            {" · "}
            {stats.contactsCount}{" "}
            {stats.contactsCount === 1 ? "contact" : "contacts"}
            {" · "}
            <a href="/logs" className="text-accent-strong hover:underline">
              See activity
            </a>
          </p>
        </div>
        {stats.instagramAccounts.length > 1 && (
          <AccountSelect
            accounts={stats.instagramAccounts}
            value={selectedAccountId}
            onChange={handleAccountChange}
          />
        )}
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
        <StatCard label="Active Campaigns" value={stats.activeAutomations} />
        <StatCard label="DMs Sent" value={stats.dmsSentMonth} />
        <StatCard label="Skipped" value={stats.dmsSkippedMonth} />
        <StatCard label="Failed" value={stats.dmsFailedMonth} />
        <StatCard label="Clicks" value={stats.clicksThisMonth} />
        <StatCard label="CTR" value={`${stats.ctrThisMonth}%`} />
      </div>

      {/* Chart + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-6 gap-4 sm:gap-6">
        {/* 7-Day Chart */}
        <div className="lg:col-span-3 panel rounded p-4 sm:p-6">
          <h2 className="text-sm font-semibold text-foreground mb-6">
            DMs — Last 7 Days
          </h2>
          <div className="flex items-end gap-1.5 h-40 sm:gap-2">
            {stats.dailyDMs.map((day) => (
              <div
                key={day.date}
                className="min-w-0 flex-1 flex flex-col items-center gap-2"
              >
                <span className="text-xs text-muted font-medium tabular-nums">
                  {day.count}
                </span>
                <div
                  className="w-full rounded-sm bg-accent min-h-[4px]"
                  style={{ height: `${Math.max((day.count / maxDM) * 100, 4)}%` }}
                />
                {/* Seven labels share a phone's width, so they must not wrap. */}
                <span className="w-full truncate text-center text-[10px] text-muted">
                  {day.date}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Keywords */}
        <div className="lg:col-span-1 panel rounded p-4 sm:p-6">
          <h2 className="text-sm font-semibold text-foreground mb-4">
            Top Keywords
          </h2>
          <div className="space-y-3">
            {stats.topKeywords.length === 0 && (
              <p className="text-sm text-muted py-8">No keyword matches yet</p>
            )}
            {stats.topKeywords.map((keyword) => (
              <div
                key={keyword.keyword}
                className="flex items-center justify-between gap-3"
              >
                <span className="truncate text-sm font-medium text-foreground">
                  {keyword.keyword}
                </span>
                <span className="text-xs text-muted tabular-nums">
                  {keyword.count}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="lg:col-span-2 panel rounded p-4 sm:p-6">
          <h2 className="text-sm font-semibold text-foreground mb-4">
            Recent Activity
          </h2>
          <div className="space-y-3 max-h-60 overflow-y-auto">
            {stats.recentLogs.length === 0 && (
              <p className="text-sm text-muted text-center py-8">
                No activity yet
              </p>
            )}
            {stats.recentLogs.map((log) => (
              <div
                key={log.id}
                className="flex items-center justify-between gap-3 py-2 border-b border-border last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">
                    @{log.commenterName ?? "unknown"}
                  </p>
                  <p className="text-xs text-muted truncate">
                    {log.instagramAccount
                      ? `@${log.instagramAccount.username} · `
                      : ""}
                    {log.commentText}
                  </p>
                </div>
                <StatusBadge status={log.status} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
