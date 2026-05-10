"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartPoint } from "@/lib/mockDashboardData";

/**
 * Section 5 — 14-day activity line chart.
 *
 * Three series rendered with Recharts:
 *   - Critical  (clay)
 *   - Removed   (cobalt-light)
 *   - Calibrate (ochre)
 *
 * Styling stays minimal to match the mockup:
 *   - Thin lines (strokeWidth 2-2.5) with small dots so points are visible
 *     but the chart still reads as quiet, not data-noisy.
 *   - Subtle horizontal grid lines (var(--line)). No vertical grid.
 *   - Y-axis runs 0 → max value in the dataset, integer ticks only — never
 *     show "1.5 incidents/day".
 *   - X-axis dates render as DD (day-of-month) and only every other tick is
 *     drawn so the labels don't crowd on phone widths.
 *
 * The chart sits inside a fixed-height responsive container — 280px on
 * desktop, 180px on mobile — to match the visual weight of the rest of the
 * page (taller would dominate; shorter is unreadable for 14 data points).
 */
export default function ActivityChart({
  series,
}: {
  series: ChartPoint[];
}) {
  // Compute the y-axis ceiling. Recharts can auto-pick, but we lock the floor
  // at 0 and round the ceiling to the nearest integer ≥1 so an all-zero day
  // still shows a 0..1 axis instead of collapsing to a single line.
  const maxValue = Math.max(
    1,
    ...series.flatMap((p) => [p.critical, p.removed, p.calibrate]),
  );

  // Format the date string ("2026-05-09") down to "09" — day-of-month only,
  // because the legend already says "14 days" so the user has the context.
  const formatDate = (iso: string) => iso.slice(8, 10);

  return (
    <div className="rounded-token-4 border border-line bg-ink-2 px-token-6 md:px-token-10 py-token-6 md:py-token-9 mb-token-11">
      <header className="mb-token-3 md:mb-token-8 flex flex-col md:flex-row md:justify-between md:items-center gap-token-3 md:gap-0">
        <h2 className="text-h3 md:text-base font-semibold text-stone">
          Activity (14 days)
        </h2>
        <ChartLegend />
      </header>

      {/* The fixed-height wrapper is mandatory — Recharts' ResponsiveContainer
          measures the parent and renders nothing if height is zero. */}
      <div className="h-[180px] md:h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={series}
            margin={{ top: 8, right: 8, bottom: 4, left: -16 }}
          >
            <CartesianGrid
              vertical={false}
              stroke="var(--line)"
              strokeDasharray="0"
            />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              stroke="var(--stone-4)"
              tick={{ fill: "var(--stone-4)", fontSize: 11 }}
              axisLine={{ stroke: "var(--line)" }}
              tickLine={false}
              interval={1} // show every other tick so labels don't crowd
            />
            <YAxis
              domain={[0, maxValue]}
              allowDecimals={false}
              stroke="var(--stone-4)"
              tick={{ fill: "var(--stone-4)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip
              contentStyle={{
                background: "var(--ink-3)",
                border: "1px solid var(--line-2)",
                borderRadius: 8,
                fontSize: 12,
                color: "var(--stone)",
              }}
              labelFormatter={(label) => `Day ${formatDate(String(label))}`}
              cursor={{ stroke: "var(--line-2)", strokeDasharray: "3 3" }}
            />
            <Line
              type="monotone"
              dataKey="critical"
              name="Critical"
              stroke="var(--clay)"
              strokeWidth={2.5}
              dot={{ r: 3, fill: "var(--clay)", stroke: "var(--clay)" }}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="removed"
              name="Removed"
              stroke="var(--cobalt-light)"
              strokeWidth={2}
              dot={{
                r: 2.5,
                fill: "var(--cobalt-light)",
                stroke: "var(--cobalt-light)",
              }}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="calibrate"
              name="Calibrate"
              stroke="var(--ochre)"
              strokeWidth={2}
              dot={{ r: 2.5, fill: "var(--ochre)", stroke: "var(--ochre)" }}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Three-color legend matching the lines. Sits to the right of the title on
 * desktop, below the title on mobile. Wrap-friendly so a narrower phone
 * still flows cleanly. */
function ChartLegend() {
  return (
    <div className="flex flex-wrap gap-token-4 md:gap-token-5 text-micro md:text-meta text-stone-3">
      <LegendItem color="var(--clay)" label="Critical" />
      <LegendItem color="var(--cobalt-light)" label="Removed" />
      <LegendItem color="var(--ochre)" label="Calibrate" />
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center">
      <span
        className="inline-block w-1.5 h-1.5 md:w-2 md:h-2 rounded-full mr-1.5"
        style={{ background: color }}
        aria-hidden
      />
      {label}
    </span>
  );
}
