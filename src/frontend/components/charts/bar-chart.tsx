"use client";

import { useCallback, useMemo, useState } from "react";
import { ChartFrame, ChartTooltip, GridLines, compactNum, niceTicks, seriesColor } from "./primitives";
import { cn } from "@/lib/utils";

interface BarDatum {
  label: string;
  value: number;
  slot?: number;
  hint?: string;
}

/**
 * Magnitude comparison. Data-ends are rounded 4px and anchored to the baseline;
 * adjacent bars keep a surface gap so segments never fuse.
 *
 * Vertical and horizontal are separate components rather than one with an
 * early return — a conditional return above a hook is a hooks-order violation,
 * and the two layouts genuinely need different state anyway.
 */
export function BarChart({
  data,
  height = 220,
  formatValue = (v: number) => v.toLocaleString("en-IN"),
  onBarClick,
  horizontal,
}: {
  data: BarDatum[];
  height?: number;
  formatValue?: (v: number) => string;
  onBarClick?: (label: string) => void;
  horizontal?: boolean;
}) {
  return horizontal ? (
    <HorizontalBars data={data} formatValue={formatValue} onBarClick={onBarClick} />
  ) : (
    <VerticalBars data={data} height={height} formatValue={formatValue} onBarClick={onBarClick} />
  );
}

function VerticalBars({
  data,
  height,
  formatValue,
  onBarClick,
}: {
  data: BarDatum[];
  height: number;
  formatValue: (v: number) => string;
  onBarClick?: (label: string) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  // Measured on mount via a callback ref rather than read from ref.current
  // during render — reading a ref while rendering is not safe under concurrent
  // React, and the tooltip needs real pixels to position against.
  const [boxWidth, setBoxWidth] = useState(0);
  const measure = useCallback((node: HTMLDivElement | null) => {
    if (node) setBoxWidth(node.clientWidth);
  }, []);

  const W = 720;
  const H = height;
  const PAD_L = 38;
  const PAD_B = 26;
  const PAD_T = 10;
  const plotW = W - PAD_L;
  const plotH = H - PAD_B - PAD_T;

  const { ticks, bars } = useMemo(() => {
    const rawMax = Math.max(1, ...data.map((d) => d.value));
    const tickVals = niceTicks(rawMax, 4);
    const maxV = tickVals[tickVals.length - 1] || rawMax;
    const y = (v: number) => PAD_T + plotH - (v / maxV) * plotH;
    const slotW = plotW / Math.max(1, data.length);
    const barW = Math.max(4, Math.min(46, slotW - 10));
    return {
      ticks: tickVals.map((v) => ({ y: y(v), label: compactNum(v) })),
      bars: data.map((d, i) => ({
        ...d,
        x: PAD_L + i * slotW + (slotW - barW) / 2,
        y: y(d.value),
        w: barW,
        h: Math.max(2, PAD_T + plotH - y(d.value)),
      })),
    };
  }, [data, plotW, plotH]);

  const scale = (boxWidth || W) / W;

  return (
    <ChartFrame height={height}>
      <div ref={measure} className="relative" onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }} role="img">
          <GridLines ticks={ticks} width={W} height={PAD_T + plotH} padLeft={PAD_L} />
          {bars.map((b, i) => (
            <g
              key={b.label + i}
              onMouseEnter={() => setHover(i)}
              onClick={onBarClick ? () => onBarClick(b.label) : undefined}
              className={onBarClick ? "cursor-pointer" : undefined}
            >
              {/* Generous hit target — bigger than the mark. */}
              <rect x={b.x - 5} y={PAD_T} width={b.w + 10} height={plotH} fill="transparent" />
              <rect
                x={b.x}
                y={b.y}
                width={b.w}
                height={b.h}
                rx={4}
                fill={seriesColor(b.slot ?? 0)}
                opacity={hover == null || hover === i ? 1 : 0.45}
                style={{ transition: "opacity 150ms" }}
              />
            </g>
          ))}
          {bars.map((b, i) => (
            <text
              key={`l${i}`}
              x={b.x + b.w / 2}
              y={H - 8}
              textAnchor="middle"
              className="fill-[var(--viz-axis)] text-[9.5px]"
            >
              {b.label.length > 9 ? b.label.slice(0, 8) + "…" : b.label}
            </text>
          ))}
        </svg>
        {hover != null && bars[hover] ? (
          <ChartTooltip
            x={(bars[hover].x + bars[hover].w / 2) * scale}
            y={(bars[hover].y / H) * height}
          >
            <div className="font-semibold text-ink">{data[hover].label}</div>
            <div className="tnum text-ink-muted">{formatValue(data[hover].value)}</div>
            {data[hover].hint ? (
              <div className="text-[0.7rem] text-ink-faint">{data[hover].hint}</div>
            ) : null}
          </ChartTooltip>
        ) : null}
      </div>
    </ChartFrame>
  );
}

/**
 * Horizontal bars for ranked lists (top colleges, revenue by method) — label
 * legibility beats axis convention when the categories have long names. The
 * value is always direct-labelled, which is also the relief the light-mode
 * contrast WARN obligates.
 */
function HorizontalBars({
  data,
  formatValue,
  onBarClick,
}: {
  data: BarDatum[];
  formatValue: (v: number) => string;
  onBarClick?: (label: string) => void;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="space-y-2">
      {data.map((d, i) => (
        <button
          key={d.label + i}
          onClick={onBarClick ? () => onBarClick(d.label) : undefined}
          disabled={!onBarClick}
          className={cn(
            "group grid w-full grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-3 rounded-neo-sm px-1 py-1 text-left transition-colors",
            onBarClick && "hover:bg-plane-alt",
          )}
        >
          <span className="truncate text-[0.78rem] text-ink-soft">{d.label}</span>
          <span className="neo-inset-sm h-2.5 overflow-hidden rounded-full">
            <span
              className="block h-full rounded-full transition-[width] duration-700 ease-out"
              style={{
                width: `${(d.value / max) * 100}%`,
                background: seriesColor(d.slot ?? i),
              }}
            />
          </span>
          <span className="tnum shrink-0 text-[0.78rem] font-semibold text-ink">
            {formatValue(d.value)}
          </span>
        </button>
      ))}
    </div>
  );
}
