"use client";

import { useState } from "react";
import { seriesColor } from "./primitives";
import { cn } from "@/lib/utils";

/**
 * Part-to-whole for a SMALL number of slices (≤6). Segments carry a 2px surface
 * gap so they never fuse, and the legend always ships values — the light-mode
 * slots sit under 3:1, so identity can never rest on colour alone.
 */
export function DonutChart({
  data,
  size = 176,
  thickness = 26,
  centerLabel,
  centerValue,
  formatValue = (v: number) => v.toLocaleString("en-IN"),
  className,
}: {
  data: { label: string; value: number; slot?: number }[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
  formatValue?: (v: number) => string;
  className?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const GAP = 2; // surface gap, in px of arc length

  // Each arc starts where all the preceding ones end. Derived from a running
  // prefix sum rather than a mutated closure variable, so the render is pure.
  const arcs = data.map((d, i) => {
    const startFraction = data.slice(0, i).reduce((s, x) => s + x.value, 0) / total;
    const len = (d.value / total) * c;
    return { d, i, len: Math.max(0, len - GAP), offset: startFraction * c };
  });

  return (
    <div className={cn("flex flex-wrap items-center gap-6", className)}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <div className="neo-inset absolute inset-0 rounded-full" />
        <svg width={size} height={size} className="absolute -rotate-90" role="img">
          {arcs.map((a) => (
            <circle
              key={a.d.label}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={seriesColor(a.d.slot ?? a.i)}
              strokeWidth={hover === a.i ? thickness + 4 : thickness}
              strokeDasharray={`${a.len} ${c - a.len}`}
              strokeDashoffset={-a.offset}
              opacity={hover == null || hover === a.i ? 1 : 0.4}
              onMouseEnter={() => setHover(a.i)}
              onMouseLeave={() => setHover(null)}
              style={{ transition: "opacity 150ms, stroke-width 150ms", cursor: "pointer" }}
            />
          ))}
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <div className="tnum font-display text-[1.15rem] leading-none font-bold text-ink">
              {hover != null ? formatValue(data[hover].value) : (centerValue ?? formatValue(total))}
            </div>
            <div className="engraved mt-1.5 !text-[0.58rem]">
              {hover != null ? data[hover].label : (centerLabel ?? "Total")}
            </div>
          </div>
        </div>
      </div>

      {/* Legend with values — mandatory relief, not decoration. */}
      <ul className="min-w-0 flex-1 space-y-1.5">
        {data.map((d, i) => (
          <li
            key={d.label}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            className={cn(
              "flex items-center gap-2.5 rounded-neo-sm px-2 py-1 transition-colors",
              hover === i && "bg-plane-alt",
            )}
          >
            <span
              className="size-2.5 shrink-0 rounded-[3px]"
              style={{ background: seriesColor(d.slot ?? i) }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate text-[0.8rem] text-ink-soft">{d.label}</span>
            <span className="tnum text-[0.8rem] font-semibold text-ink">{formatValue(d.value)}</span>
            <span className="tnum w-10 shrink-0 text-right text-[0.72rem] text-ink-muted">
              {((d.value / total) * 100).toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
