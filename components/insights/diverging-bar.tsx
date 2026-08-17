"use client";

/**
 * Diverging bar: a value above or below a baseline.
 *
 * Used for the audience mismatch, where the number is a signed difference
 * between two shares and the sign is the whole point. A plain bar chart of two
 * series would show the same data and bury the finding, because the reader
 * would have to do the subtraction themselves for every row.
 *
 * Marks follow the spec: thin bars, 4px rounded ends on the data side only and
 * square against the baseline, a 2px surface gap between adjacent fills, and a
 * recessive centre rule rather than a heavy axis.
 */

import { useId, useState } from "react";

export interface DivergingRow {
  label: string;
  value: number;
  /** Shown in the tooltip beneath the headline number. */
  detail?: string;
}

export default function DivergingBar({
  rows,
  unit = "",
  positiveLabel,
  negativeLabel,
}: {
  rows: DivergingRow[];
  unit?: string;
  positiveLabel: string;
  negativeLabel: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const headingId = useId();

  if (!rows.length) return null;

  // A symmetric domain, so a +8 and a −8 are the same length on the page. An
  // asymmetric one would make the larger side look further from zero than it is.
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 1);

  return (
    <div>
      {/* Two series means a legend is required, and it doubles as the key to
          what the sign means — "positive" is meaningless without it. */}
      <div
        className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted"
        id={headingId}
      >
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden
            className="h-2.5 w-2.5 rounded-[2px]"
            style={{ background: "var(--viz-pos)" }}
          />
          {positiveLabel}
        </span>
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden
            className="h-2.5 w-2.5 rounded-[2px]"
            style={{ background: "var(--viz-neg)" }}
          />
          {negativeLabel}
        </span>
      </div>

      <ul className="space-y-2.5" aria-describedby={headingId}>
        {rows.map((row, i) => {
          const pct = (Math.abs(row.value) / max) * 50; // half-width each side
          const positive = row.value >= 0;
          return (
            <li
              key={row.label}
              className="grid grid-cols-[5.5rem_1fr_4rem] items-center gap-3"
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover(null)}
            >
              <span className="truncate text-sm text-foreground">{row.label}</span>

              <div className="relative h-6">
                {/* Centre rule — recessive, not an axis line. */}
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-1/2 w-px"
                  style={{ background: "var(--viz-grid)" }}
                />
                <span
                  className="absolute top-1/2 h-3.5 -translate-y-1/2 transition-[width] duration-200"
                  style={{
                    background: positive ? "var(--viz-pos)" : "var(--viz-neg)",
                    width: `${pct}%`,
                    // Square against the baseline, rounded at the data end.
                    left: positive ? "50%" : undefined,
                    right: positive ? undefined : "50%",
                    borderRadius: positive ? "0 4px 4px 0" : "4px 0 0 4px",
                    opacity: hover === null || hover === i ? 1 : 0.55,
                  }}
                />
              </div>

              {/* Values wear text tokens, never the series colour. */}
              <span className="text-right text-sm tabular-nums text-muted">
                {row.value > 0 ? "+" : ""}
                {row.value.toFixed(1)}
                {unit}
              </span>

              {hover === i && row.detail && (
                <span className="col-span-3 -mt-1 text-xs text-muted-2">
                  {row.detail}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
