"use client";

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * Shared chart chrome.
 *
 * Two rules hold across every chart in this console:
 *
 *  1. The plot area is an INSET well. The card frame stays raised, the data
 *     recedes into it. That is the surface ladder applied to charts.
 *  2. Series colours come from the validated `--viz-*` slots in fixed order,
 *     never cycled and never hand-picked. Four of the light-mode slots sit
 *     under 3:1 against the surface, so every chart here also carries a legend
 *     or direct labels — identity is never colour alone.
 */

export const SERIES = [
  "var(--viz-1)",
  "var(--viz-2)",
  "var(--viz-3)",
  "var(--viz-4)",
  "var(--viz-5)",
  "var(--viz-6)",
  "var(--viz-7)",
  "var(--viz-8)",
] as const;

export const SEQ = [
  "var(--seq-1)",
  "var(--seq-2)",
  "var(--seq-3)",
  "var(--seq-4)",
  "var(--seq-5)",
  "var(--seq-6)",
  "var(--seq-7)",
] as const;

/** Slot lookup — always by entity, never by rank, so filtering never repaints. */
export function seriesColor(index: number): string {
  return SERIES[index % SERIES.length];
}

export function ChartFrame({
  children,
  className,
  height = 220,
}: {
  children: ReactNode;
  className?: string;
  height?: number;
}) {
  return (
    <div
      className={cn("neo-inset relative overflow-hidden rounded-neo p-3", className)}
      style={{ minHeight: height }}
    >
      {children}
    </div>
  );
}

export function Legend({
  items,
  className,
}: {
  items: { label: string; color: string; value?: string }[];
  className?: string;
}) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5", className)}>
      {items.map((it) => (
        <li key={it.label} className="inline-flex items-center gap-1.5">
          <span
            className="size-2.5 shrink-0 rounded-[3px]"
            style={{ background: it.color }}
            aria-hidden
          />
          <span className="text-[0.75rem] text-ink-muted">{it.label}</span>
          {it.value ? (
            <span className="tnum text-[0.75rem] font-semibold text-ink">{it.value}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** Floating tooltip body — matches the L2 float surface. */
export function ChartTooltip({
  x,
  y,
  children,
  align = "center",
}: {
  x: number;
  y: number;
  children: ReactNode;
  align?: "center" | "left" | "right";
}) {
  return (
    <div
      className="neo-float pointer-events-none absolute z-20 rounded-neo-sm border border-hairline px-2.5 py-1.5 text-[0.75rem] leading-snug whitespace-nowrap"
      style={{
        left: x,
        top: y,
        transform:
          align === "center"
            ? "translate(-50%, -115%)"
            : align === "left"
              ? "translate(8px, -50%)"
              : "translate(-100%, -50%) translateX(-8px)",
      }}
    >
      {children}
    </div>
  );
}

/** Recessive gridline set. */
export function GridLines({
  ticks,
  width,
  height,
  padLeft,
}: {
  ticks: { y: number; label: string }[];
  width: number;
  height: number;
  padLeft: number;
}) {
  return (
    <g aria-hidden>
      {ticks.map((t) => (
        <g key={t.label}>
          <line
            x1={padLeft}
            x2={width}
            y1={t.y}
            y2={t.y}
            stroke="var(--viz-grid)"
            strokeWidth={1}
          />
          <text
            x={padLeft - 8}
            y={t.y + 3.5}
            textAnchor="end"
            className="fill-[var(--viz-axis)] text-[9.5px]"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {t.label}
          </text>
        </g>
      ))}
      <line x1={padLeft} x2={width} y1={height} y2={height} stroke="var(--viz-axis)" strokeWidth={1} />
    </g>
  );
}

/** "Nice" axis ticks — round numbers, never 0, 1.37, 2.74. */
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0];
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const out: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) out.push(v);
  return out;
}

export function compactNum(n: number): string {
  if (Math.abs(n) >= 1e7) return `${(n / 1e7).toFixed(1)}Cr`;
  if (Math.abs(n) >= 1e5) return `${(n / 1e5).toFixed(1)}L`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k`;
  return String(Math.round(n));
}
