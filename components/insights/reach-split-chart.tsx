"use client";

/**
 * Daily reach, split into people who already follow and people who do not.
 *
 * An emphasis chart, not a categorical one. The question is "how much of this
 * reached someone new", so non-followers carry the accent and followers are
 * de-emphasis grey. Giving both halves a hue of their own would make them look
 * equally important and bury the one number worth watching.
 *
 * The grey is intentionally chromaless — see the note in globals.css about why
 * the categorical chroma floor does not apply to it.
 */

import { useState } from "react";

export interface ReachPoint {
  date: string;
  follower: number;
  nonFollower: number;
  total: number;
  newAudiencePct: number;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export default function ReachSplitChart({ points }: { points: ReachPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);

  if (!points.length) return null;
  const max = Math.max(...points.map((p) => p.total), 1);
  const active = hover === null ? null : points[hover];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted">
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden
            className="h-2.5 w-2.5 rounded-[2px]"
            style={{ background: "var(--viz-accent)" }}
          />
          Reached someone new
        </span>
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden
            className="h-2.5 w-2.5 rounded-[2px]"
            style={{ background: "var(--viz-muted)" }}
          />
          Already following
        </span>
      </div>

      {/* Fixed height so the row does not resize as the hover readout appears. */}
      <div className="relative h-48">
        <div className="flex h-full items-end gap-[3px]">
          {points.map((p, i) => {
            const h = (p.total / max) * 100;
            const newShare = p.total ? (p.nonFollower / p.total) * 100 : 0;
            const dim = hover !== null && hover !== i;
            return (
              <button
                key={p.date}
                type="button"
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                aria-label={`${p.date}: ${fmt(p.total)} reached, ${p.newAudiencePct.toFixed(0)}% new`}
                className="group relative flex h-full min-w-0 flex-1 flex-col justify-end rounded-sm focus-visible:outline-2"
                style={{ opacity: dim ? 0.5 : 1, transition: "opacity 150ms" }}
              >
                <span
                  className="flex w-full flex-col justify-end overflow-hidden rounded-t-[4px]"
                  style={{ height: `${Math.max(h, 2)}%` }}
                >
                  {/* New audience on top, where the eye lands. A 2px surface
                      gap separates the two fills rather than a border, so the
                      segments never appear to merge at small heights. */}
                  <span
                    className="w-full rounded-t-[4px]"
                    style={{
                      height: `${newShare}%`,
                      background: "var(--viz-accent)",
                      marginBottom: "2px",
                    }}
                  />
                  <span
                    className="w-full flex-1"
                    style={{ background: "var(--viz-muted)" }}
                  />
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* One readout rather than a label on every bar. */}
      <div className="mt-3 min-h-[2.5rem] border-t border-border pt-2.5 text-xs">
        {active ? (
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="font-medium text-foreground tabular-nums">
              {new Date(`${active.date}T00:00:00Z`).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                timeZone: "UTC",
              })}
            </span>
            <span className="text-muted tabular-nums">
              {fmt(active.total)} reached
            </span>
            <span className="text-muted tabular-nums">
              {fmt(active.nonFollower)} new ({active.newAudiencePct.toFixed(0)}%)
            </span>
            <span className="text-muted tabular-nums">
              {fmt(active.follower)} existing
            </span>
          </div>
        ) : (
          <span className="text-muted">
            {points.length} day{points.length === 1 ? "" : "s"} · hover a bar for
            the split
          </span>
        )}
      </div>
    </div>
  );
}
