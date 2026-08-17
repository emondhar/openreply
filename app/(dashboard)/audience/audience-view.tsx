"use client";

/**
 * Audience & content insight.
 *
 * Every figure here is derived from Instagram's aggregate totals — none of it
 * is a metric the API serves directly. The point of the page is the pairings:
 * followers against engagers, reach against follow status, watch time against
 * clip length, reach against what it actually earned.
 */

import { useState } from "react";
import DivergingBar from "@/components/insights/diverging-bar";
import ReachSplitChart, {
  type ReachPoint,
} from "@/components/insights/reach-split-chart";
import type { MismatchRow, FunnelRow, ReelRetention } from "@/lib/insights/queries";

type Dimension = "AGE" | "GENDER" | "COUNTRY" | "CITY";

const DIMENSIONS: { value: Dimension; label: string }[] = [
  { value: "AGE", label: "Age" },
  { value: "GENDER", label: "Gender" },
  { value: "COUNTRY", label: "Country" },
  { value: "CITY", label: "City" },
];

function fmt(n: number | null): string {
  if (n === null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function pct(n: number | null): string {
  return n === null ? "—" : `${n.toFixed(1)}%`;
}

export interface AudienceViewProps {
  username: string;
  mismatch: Record<Dimension, MismatchRow[]>;
  reach: ReachPoint[];
  reels: ReelRetention[];
  funnel: FunnelRow[];
  coverage: {
    audienceRows: number;
    audienceTo: string | null;
    metricRows: number;
    capturingSince: string | null;
  };
}

/** Shown wherever a panel has no data yet, with the reason rather than a shrug. */
function Empty({ reason }: { reason: string }) {
  return <p className="py-10 text-center text-sm text-muted">{reason}</p>;
}

function Panel({
  eyebrow,
  sig,
  title,
  lede,
  children,
}: {
  eyebrow: string;
  sig: string;
  title: React.ReactNode;
  lede: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel rounded-xl p-5 sm:p-7">
      <p className="b-eyebrow" style={{ "--sig": sig } as React.CSSProperties}>
        {eyebrow}
      </p>
      <h2 className="b-display mt-3 text-xl sm:text-2xl">{title}</h2>
      <p className="mt-2 max-w-(--measure) text-sm leading-6 text-muted">{lede}</p>
      <div className="mt-6">{children}</div>
    </section>
  );
}

export default function AudienceView({
  username,
  mismatch,
  reach,
  reels,
  funnel,
  coverage,
}: AudienceViewProps) {
  const [dimension, setDimension] = useState<Dimension>("AGE");

  const rows = mismatch[dimension] ?? [];
  const totalReach = reach.reduce((n, p) => n + p.total, 0);
  const newReach = reach.reduce((n, p) => n + p.nonFollower, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="b-display text-2xl sm:text-3xl">
          Audience &amp; <span className="b-script">c</span>ontent
        </h1>
        <p className="mt-1.5 text-sm text-muted">
          @{username}
          {coverage.capturingSince
            ? ` · capturing since ${coverage.capturingSince}`
            : " · no snapshots captured yet"}
        </p>
      </div>

      {/* The honest caveat, first. Every number below is only as deep as the
          capture history, and on a new instance that is nothing at all. */}
      {coverage.audienceRows === 0 && coverage.metricRows === 0 && (
        <div className="panel rounded-xl p-5">
          <p className="text-sm text-foreground">
            No insight data has been captured yet.
          </p>
          <p className="mt-2 max-w-(--measure) text-sm leading-6 text-muted">
            The nightly job runs at 08:00 UTC and writes the first rows then.
            Instagram keeps no demographic history of its own, so these charts
            fill in from the day capture starts rather than backwards — and
            demographics need 100+ followers before Instagram will return them
            at all.
          </p>
        </div>
      )}

      {/* ---- the headline pairing ---- */}
      <Panel
        eyebrow="Audience"
        sig="var(--lime)"
        title={
          <>
            Who follows you vs who <span className="b-script">a</span>ctually
            engages
          </>
        }
        lede="Positive means that group engages harder than its share of your audience — the cheapest growth available, because they already respond. Negative means they followed for something you have stopped making."
      >
        <div className="mb-5 flex flex-wrap gap-2">
          {DIMENSIONS.map((d) => (
            <button
              key={d.value}
              type="button"
              onClick={() => setDimension(d.value)}
              aria-pressed={dimension === d.value}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                dimension === d.value
                  ? "bg-accent-strong text-background"
                  : "border border-border text-muted hover:text-foreground"
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>

        {rows.length ? (
          <>
            <DivergingBar
              rows={rows.map((r) => ({
                label: r.bucket,
                value: r.delta,
                detail: `${r.followerPct.toFixed(1)}% of followers · ${r.engagedPct.toFixed(1)}% of engagers`,
              }))}
              unit="pts"
              positiveLabel="Engages more than their share"
              negativeLabel="Engages less than their share"
            />
            <p className="mt-5 text-xs leading-5 text-muted-2">
              Shares are of the top 45 buckets Instagram returns, not of your
              whole audience — it truncates the long tail upstream and there is
              no way to recover it.
            </p>
          </>
        ) : (
          <Empty reason="No demographic snapshots yet. Instagram needs 100+ followers and 100+ engagers before it will return these." />
        )}
      </Panel>

      {/* ---- growth ---- */}
      <Panel
        eyebrow="Reach"
        sig="var(--cyan)"
        title={
          <>
            Did it reach anyone <span className="b-script">n</span>ew
          </>
        }
        lede="A total reach figure cannot tell an account showing the same people every post from one finding new people. These are opposite situations with opposite fixes."
      >
        {reach.length ? (
          <>
            {/* Hero figure: the one number the panel exists to answer. */}
            <div className="mb-6 flex flex-wrap items-baseline gap-x-3">
              <span className="b-display text-4xl tabular-nums text-foreground">
                {totalReach ? ((newReach / totalReach) * 100).toFixed(0) : 0}%
              </span>
              <span className="text-sm text-muted">
                of reach was people who don&rsquo;t follow you
              </span>
            </div>
            <ReachSplitChart points={reach} />
          </>
        ) : (
          <Empty reason="No reach snapshots yet. The nightly capture records this with a follow_type breakdown." />
        )}
      </Panel>

      {/* ---- reels ---- */}
      <Panel
        eyebrow="Reels"
        sig="var(--pink)"
        title={
          <>
            How much of each reel is <span className="b-script">w</span>atched
          </>
        }
        lede="Raw watch time says almost nothing on its own — six seconds is excellent on a 15-second reel and poor on a 90-second one."
      >
        {reels.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-2.5 pr-4 text-xs font-semibold uppercase tracking-wider text-muted">
                    Reel
                  </th>
                  <th className="pb-2.5 px-4 text-right text-xs font-semibold uppercase tracking-wider text-muted">
                    Views
                  </th>
                  <th className="pb-2.5 px-4 text-right text-xs font-semibold uppercase tracking-wider text-muted">
                    Avg watch
                  </th>
                  <th className="pb-2.5 pl-4 text-right text-xs font-semibold uppercase tracking-wider text-muted">
                    Retention
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {reels.map((r) => (
                  <tr key={r.mediaId}>
                    <td className="max-w-[16rem] truncate py-2.5 pr-4 text-foreground">
                      {r.caption?.slice(0, 60) || r.mediaId}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted">
                      {fmt(r.views)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted">
                      {r.avgWatchTimeMs
                        ? `${(r.avgWatchTimeMs / 1000).toFixed(1)}s`
                        : "—"}
                    </td>
                    <td className="py-2.5 pl-4 text-right tabular-nums text-muted">
                      {r.retentionPct === null ? (
                        <span title="Clip duration unknown">—</span>
                      ) : (
                        pct(r.retentionPct)
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-4 text-xs leading-5 text-muted-2">
              Retention needs the clip length, which Instagram does not return
              on the insights endpoint. Rows show a dash until durations are
              supplied.
            </p>
          </div>
        ) : (
          <Empty reason="No reel playback data captured yet." />
        )}
      </Panel>

      {/* ---- funnel: a table, deliberately ---- */}
      <Panel
        eyebrow="Content"
        sig="var(--yellow)"
        title={
          <>
            What each post actually <span className="b-script">e</span>arned
          </>
        }
        lede="Instagram can tell you a post reached 50,000 people. Only this instance knows how many of them commented a keyword, got a DM, and clicked the link."
      >
        {funnel.length ? (
          <>
            {/* Seven measures per row is a table, not a chart — past about
                seven classes that all carry meaning, more colour stops helping
                and starts hiding the data. */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[46rem] text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    {["Post", "Reach", "Eng. rate", "Visits", "Follows", "DMs", "Clicks"].map(
                      (h, i) => (
                        <th
                          key={h}
                          className={`pb-2.5 text-xs font-semibold uppercase tracking-wider text-muted ${
                            i === 0 ? "pr-4" : "px-4 text-right"
                          }`}
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {funnel.map((p) => (
                    <tr key={p.mediaId}>
                      <td className="max-w-[14rem] truncate py-2.5 pr-4 text-foreground">
                        {p.permalink ? (
                          <a
                            href={p.permalink}
                            target="_blank"
                            rel="noreferrer"
                            className="text-accent-strong underline underline-offset-2"
                          >
                            {p.caption?.slice(0, 48) || p.mediaId}
                          </a>
                        ) : (
                          p.caption?.slice(0, 48) || p.mediaId
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted">
                        {fmt(p.reach)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted">
                        {pct(p.engagementRate)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted">
                        {fmt(p.profileVisits)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                        {fmt(p.follows)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted">
                        {p.dmsSent.toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted">
                        {p.clicks.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-xs leading-5 text-muted-2">
              Follows is per-post and reported for feed posts only — reels do
              not return it. It is usually a different post from the one with
              the most likes, which is the reason to look.
            </p>
          </>
        ) : (
          <Empty reason="No per-post snapshots captured yet." />
        )}
      </Panel>
    </div>
  );
}
