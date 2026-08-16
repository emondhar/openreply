/**
 * Stat Card
 *
 * Metric panel with label, value, and optional trend.
 */

interface StatCardProps {
  label: string;
  value: string | number;
  trend?: string;
  trendUp?: boolean;
}

export default function StatCard({ label, value, trend, trendUp }: StatCardProps) {
  return (
    <div className="panel rounded-xl p-4">
      <p className="text-sm text-muted">{label}</p>
      {/* Display face on the number, body face on the label — the same split
          the brand site uses to separate a statement from its caption. */}
      <p className="b-display mt-1 text-2xl tabular-nums text-foreground">
        {value}
      </p>
      {trend && (
        <p className={`text-xs mt-1 ${trendUp ? "text-success" : "text-error"}`}>
          {trendUp ? "Up" : "Down"} {trend}
        </p>
      )}
    </div>
  );
}
