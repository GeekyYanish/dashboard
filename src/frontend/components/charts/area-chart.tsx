"use client";

import { useCallback, useMemo, useState } from "react";
import { ChartFrame, ChartTooltip, GridLines, Legend, compactNum, niceTicks, seriesColor } from "./primitives";
import { usePrefs } from "@/frontend/prefs";

export interface AreaSeries {
  key: string;
  label: string;
  values: number[];
  /** Fixed slot index — colour follows the entity, never its rank. */
  slot: number;
}

/**
 * Change over time. Crosshair + tooltip by default: an SVG chart in a browser
 * IS interactive, and a 30-point series is unreadable without one.
 */
export function AreaChart({
  labels,
  series,
  height = 220,
  formatValue = (v: number) => v.toLocaleString("en-IN"),
  stacked,
}: {
  labels: string[];
  series: AreaSeries[];
  height?: number;
  formatValue?: (v: number) => string;
  stacked?: boolean;
}) {
  const { reduceMotion } = usePrefs();
  const [hover, setHover] = useState<number | null>(null);
  // Measured through a callback ref rather than read from ref.current during
  // render — a ref read while rendering is not safe under concurrent React.
  const [box, setBox] = useState<{ left: number; width: number }>({ left: 0, width: 0 });
  const measure = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      const r = node.getBoundingClientRect();
      setBox({ left: r.left, width: node.clientWidth });
    }
  }, []);

  const W = 720;
  const H = height;
  const PAD_L = 38;
  const PAD_B = 22;
  const PAD_T = 10;
  const plotW = W - PAD_L;
  const plotH = H - PAD_B - PAD_T;

  const { max, points, ticks } = useMemo(() => {
    const n = labels.length;
    const totals = labels.map((_, i) =>
      stacked ? series.reduce((s, sr) => s + (sr.values[i] ?? 0), 0) : Math.max(...series.map((sr) => sr.values[i] ?? 0)),
    );
    const rawMax = Math.max(1, ...totals);
    const tickVals = niceTicks(rawMax, 4);
    const maxV = tickVals[tickVals.length - 1] || rawMax;

    const x = (i: number) => PAD_L + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
    const y = (v: number) => PAD_T + plotH - (v / maxV) * plotH;

    // Stacked series accumulate; unstacked all sit on the baseline.
    const running = new Array(n).fill(0);
    const pts = series.map((sr) => {
      const top: [number, number][] = [];
      const bottom: [number, number][] = [];
      for (let i = 0; i < n; i++) {
        const base = stacked ? running[i] : 0;
        const v = base + (sr.values[i] ?? 0);
        top.push([x(i), y(v)]);
        bottom.push([x(i), y(base)]);
        if (stacked) running[i] = v;
      }
      return { series: sr, top, bottom };
    });

    return {
      max: maxV,
      points: pts,
      ticks: tickVals.map((v) => ({ y: y(v), label: compactNum(v) })),
    };
  }, [labels, series, stacked, plotW, plotH]);

  const path = (pts: [number, number][]) =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");

  const areaPath = (top: [number, number][], bottom: [number, number][]) =>
    top.length > 0 && bottom.length > 0
      ? `${path(top)} L${bottom[bottom.length - 1][0].toFixed(1)},${bottom[bottom.length - 1][1].toFixed(1)} ${bottom
          .slice()
          .reverse()
          .map((p) => `L${p[0].toFixed(1)},${p[1].toFixed(1)}`)
          .join(" ")} Z`
      : "";

  const onMove = (e: React.MouseEvent) => {
    if (!labels.length) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((rel - PAD_L) / plotW) * (labels.length - 1));
    setHover(Math.max(0, Math.min(labels.length - 1, i)));
  };

  const hoverX = hover != null ? PAD_L + (hover / Math.max(1, labels.length - 1)) * plotW : 0;

  return (
    <div>
      <ChartFrame height={height}>
        <div
          ref={measure}
          className="relative"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="w-full"
            style={{ height }}
            role="img"
            aria-label={`${series.map((s) => s.label).join(", ")} over ${labels.length} days`}
          >
            <GridLines ticks={ticks} width={W} height={PAD_T + plotH} padLeft={PAD_L} />

            {points.map(({ series: sr, top, bottom }) => {
              const color = seriesColor(sr.slot);
              const id = `grad-${sr.key}`;
              return (
                <g key={sr.key}>
                  <defs>
                    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={color} stopOpacity={0.26} />
                      <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <path d={areaPath(top, bottom)} fill={`url(#${id})`} />
                  <path
                    d={path(top)}
                    fill="none"
                    stroke={color}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={
                      reduceMotion
                        ? undefined
                        : {
                            strokeDasharray: 2000,
                            strokeDashoffset: 0,
                            animation: "neo-sweep 1.1s cubic-bezier(0.22,1,0.36,1)",
                            // @ts-expect-error CSS custom property
                            "--dash": 2000,
                          }
                    }
                  />
                </g>
              );
            })}

            {/* X labels — thinned so they never collide. */}
            {labels.map((l, i) => {
              const every = Math.ceil(labels.length / 7);
              if (i % every !== 0 && i !== labels.length - 1) return null;
              return (
                <text
                  key={l + i}
                  x={PAD_L + (i / Math.max(1, labels.length - 1)) * plotW}
                  y={H - 6}
                  textAnchor={i === 0 ? "start" : i === labels.length - 1 ? "end" : "middle"}
                  className="fill-[var(--viz-axis)] text-[9.5px]"
                >
                  {l}
                </text>
              );
            })}

            {hover != null ? (
              <g>
                <line
                  x1={hoverX}
                  x2={hoverX}
                  y1={PAD_T}
                  y2={PAD_T + plotH}
                  stroke="var(--viz-axis)"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                />
                {points.map(({ series: sr, top }) => (
                  <circle
                    key={sr.key}
                    cx={top[hover][0]}
                    cy={top[hover][1]}
                    r={4}
                    fill={seriesColor(sr.slot)}
                    stroke="var(--neo-base)"
                    strokeWidth={2}
                  />
                ))}
              </g>
            ) : null}
          </svg>

          {hover != null ? (
            <ChartTooltip x={(hoverX / W) * (box.width || W)} y={26}>
              <div className="mb-1 font-semibold text-ink">{labels[hover]}</div>
              {series.map((sr) => (
                <div key={sr.key} className="flex items-center gap-2">
                  <span
                    className="size-2 rounded-[2px]"
                    style={{ background: seriesColor(sr.slot) }}
                  />
                  <span className="text-ink-muted">{sr.label}</span>
                  <span className="tnum ml-auto font-semibold text-ink">
                    {formatValue(sr.values[hover] ?? 0)}
                  </span>
                </div>
              ))}
            </ChartTooltip>
          ) : null}
        </div>
      </ChartFrame>

      {series.length > 1 ? (
        <Legend
          className="mt-3"
          items={series.map((s) => ({ label: s.label, color: seriesColor(s.slot) }))}
        />
      ) : null}
      <span className="sr-only">Peak value {max.toLocaleString("en-IN")}</span>
    </div>
  );
}
