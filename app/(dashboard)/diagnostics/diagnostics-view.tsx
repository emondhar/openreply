"use client";

import { useState } from "react";
import StatusBadge from "@/components/status-badge";

interface DiagnosticsData {
  /** null when the queue could not be reached — see lib/ops/diagnostics. */
  queueCounts: Record<string, number> | null;
  workerHealth: {
    healthy: boolean;
    ageMs: number | null;
    heartbeat: {
      checkedAt: string;
      hostname?: string;
      pid: number;
      startedAt?: string;
    } | null;
  };
  workerAlerts: Array<{
    level: string;
    message: string;
    jobId?: string;
    commentId?: string;
    createdAt: string;
  }>;
  webhookFailures: Array<{
    id: string;
    object: string | null;
    errorMessage: string | null;
    createdAt: string;
  }>;
  dmFailures: Array<{
    id: string;
    status: string;
    commentId: string;
    commentText: string;
    errorMessage: string | null;
    updatedAt: string;
    automation: { name: string };
  }>;
  tokenRefreshFailures: Array<{
    id: string;
    message: string;
    createdAt: string;
  }>;
  operationalEvents: Array<{
    id: string;
    source: string;
    level: string;
    message: string;
    createdAt: string;
    resolvedAt: string | null;
  }>;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function EmptyState({ label }: { label: string }) {
  return <p className="py-5 text-center text-sm text-muted">{label}</p>;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel rounded p-4 sm:p-6">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function DiagnosticsView({
  initialData,
}: {
  initialData: DiagnosticsData;
}) {
  const [data, setData] = useState<DiagnosticsData>(initialData);
  const [loading, setLoading] = useState(false);

  async function refreshDiagnostics() {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/diagnostics");
      const payload = await response.json();
      if (payload.success) setData(payload.data);
    } finally {
      setLoading(false);
    }
  }

  const workerAgeSeconds =
    data.workerHealth.ageMs == null
      ? null
      : Math.round(data.workerHealth.ageMs / 1000);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Production Diagnostics
          </h1>
          <p className="mt-1 text-sm text-muted">
            Health, queues, webhook failures, billing events, and worker alerts.
          </p>
        </div>
        {/* The button says what it is doing. Previously it fired and looked
            identical throughout, so a slow refresh was indistinguishable from
            a dead button. */}
        <button
          onClick={() => void refreshDiagnostics()}
          disabled={loading}
          aria-busy={loading}
          className="rounded border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground transition hover:border-border-hover disabled:opacity-60"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
        <div className="panel rounded p-4 sm:p-5">
          <p className="text-xs font-semibold uppercase text-muted">
            Worker health
          </p>
          <p
            className={`mt-3 text-2xl font-bold ${
              data.workerHealth.healthy ? "text-success" : "text-warning"
            }`}
          >
            {data.workerHealth.healthy ? "Healthy" : "Needs attention"}
          </p>
          <p className="mt-2 text-xs text-muted">
            {workerAgeSeconds == null
              ? "No heartbeat found"
              : `Last heartbeat ${workerAgeSeconds}s ago`}
          </p>
        </div>
        {["waiting", "active", "delayed", "failed"].map((key) => (
          <div key={key} className="panel rounded p-4 sm:p-5">
            <p className="text-xs font-semibold uppercase text-muted">
              Queue {key}
            </p>
            {/* An em dash, not a zero: the queue being unreachable and the
                queue being empty are different facts, and this page exists to
                tell them apart. */}
            <p className="mt-3 text-2xl font-bold tabular-nums text-foreground">
              {data.queueCounts ? (data.queueCounts[key] ?? 0) : "—"}
            </p>
            {!data.queueCounts && (
              <p className="mt-1 text-xs text-warning">Queue unreachable</p>
            )}
          </div>
        ))}
      </div>

      <Section title="Recent Worker Alerts">
        {data.workerAlerts.length ? (
          <div className="space-y-3">
            {data.workerAlerts.map((alert) => (
              <div
                key={`${alert.createdAt}-${alert.jobId ?? alert.message}`}
                className="rounded border border-border bg-surface/50 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                  <p className="min-w-0 flex-1 break-words text-sm font-semibold text-foreground">
                    {alert.message}
                  </p>
                  <span className="b-badge b-badge--alert shrink-0">
                    {alert.level}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted">
                  {formatDate(alert.createdAt)}
                  {alert.commentId ? ` · ${alert.commentId}` : ""}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState label="No worker alerts recorded." />
        )}
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Campaign DM Failures And Skips">
          {data.dmFailures.length ? (
            <div className="space-y-3">
              {data.dmFailures.map((item) => (
                <div key={item.id} className="border-b border-border pb-3 last:border-0">
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                    <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                      {item.automation.name}
                    </p>
                    <StatusBadge status={item.status} />
                  </div>
                  <p className="mt-1 truncate text-xs text-muted">
                    {item.commentText}
                  </p>
                  {item.errorMessage && (
                    <p className="mt-1 text-xs text-error">{item.errorMessage}</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState label="No DM failures or skips." />
          )}
        </Section>

        <Section title="Webhook Failures">
          {data.webhookFailures.length ? (
            <div className="space-y-3">
              {data.webhookFailures.map((event) => (
                <div key={event.id} className="border-b border-border pb-3 last:border-0">
                  <p className="text-sm font-semibold text-foreground">
                    {event.object ?? "Instagram webhook"}
                  </p>
                  <p className="mt-1 text-xs text-error">
                    {event.errorMessage ?? "Unknown error"}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {formatDate(event.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState label="No failed webhook events." />
          )}
        </Section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Token Refresh Failures">
          {data.tokenRefreshFailures.length ? (
            <div className="space-y-3">
              {data.tokenRefreshFailures.map((event) => (
                <div key={event.id} className="border-b border-border pb-3 last:border-0">
                  <p className="text-sm font-semibold text-foreground">
                    {event.message}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {formatDate(event.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState label="No token refresh failures." />
          )}
        </Section>

      </div>

      <Section title="Operational Event Timeline">
        {data.operationalEvents.length ? (
          <div className="space-y-3">
            {data.operationalEvents.map((event) => (
              <div key={event.id} className="grid gap-2 border-b border-border pb-3 last:border-0 sm:grid-cols-[140px_1fr_auto]">
                <p className="text-xs font-semibold text-muted">{event.source}</p>
                <p className="text-sm text-foreground">{event.message}</p>
                <p className="text-xs text-muted">{formatDate(event.createdAt)}</p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState label="No operational events recorded." />
        )}
      </Section>
    </div>
  );
}
