"use client";

import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatUsd } from "@/lib/format";
import type { WaterfallStep } from "@/lib/business/pnl";

/**
 * Waterfall rendered with a floating-bar trick: each bar is [base, base+delta]
 * so positive/negative contributions stack from the running total.
 *
 * `steps` values are in whatever unit the caller passes (USD by default; the
 * P&L page passes so'm-converted numbers). `format`/`axisFormat` control how the
 * tooltip and Y-axis render them.
 */
export function PnlWaterfallChart({
  steps,
  format = formatUsd,
  axisFormat = (v: number) => `$${v}`,
}: {
  steps: WaterfallStep[];
  format?: (v: number) => string;
  axisFormat?: (v: number) => string;
}) {
  const data = steps.map((s) => {
    if (s.kind === "start" || s.kind === "total") {
      return { label: s.label, range: [0, s.cumulative] as [number, number], kind: s.kind, value: s.value };
    }
    const prev = s.cumulative - s.value;
    return {
      label: s.label,
      range: [Math.min(prev, s.cumulative), Math.max(prev, s.cumulative)] as [number, number],
      kind: s.kind,
      value: s.value,
    };
  });

  const colorFor = (kind: string, value: number) => {
    if (kind === "total") return value >= 0 ? "hsl(var(--success))" : "hsl(var(--destructive))";
    if (kind === "start") return "hsl(var(--primary))";
    return "hsl(var(--destructive))";
  };

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={(v: number) => axisFormat(v)}
        />
        <Tooltip
          cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
          formatter={(_v, _n, item) => [format((item?.payload as { value: number })?.value), "O'zgarish"]}
          contentStyle={{
            borderRadius: 8,
            border: "1px solid hsl(var(--border))",
            background: "hsl(var(--popover))",
            fontSize: 12,
          }}
        />
        <Bar dataKey="range" radius={[4, 4, 4, 4]}>
          {data.map((d, i) => (
            <Cell key={i} fill={colorFor(d.kind, d.value)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
