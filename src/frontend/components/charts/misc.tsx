"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { SEQ, seriesColor, ChartTooltip } from "./primitives";

/* ==========================================================================
   Sparkline — the trend beside a KPI. No axes, no tooltip: it is a texture
   that says "rising", not a chart you read values off.
   ========================================================================== */

export function Sparkline({
  values,
  color = "var(--viz-1)",
  height = 34,
  fill = true,
}: {
  values: number[];
  color?: string;
  height?: number;
  fill?: boolean;
}) {
  const W = 120;
  const H = height;
  if (values.length < 2) return <div style={{ height }} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [
    (i / (values.length - 1)) * W,
    H - 2 - ((v - min) / span) * (H - 6),
  ]);
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;
  const id = `sp-${Math.round(values[0] * 1000)}-${values.length}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full" style={{ height }} aria-hidden>
      {fill ? (
        <>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.24} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${id})`} />
        </>
      ) : null}
      <path d={line} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/* ==========================================================================
   Funnel — where people fall out between intent and turning up. The drop-off
   percentage between stages is the entire point, so it is labelled, not
   inferred from bar widths.
   ========================================================================== */

export function Funnel({
  stages,
  onStageClick,
}: {
  stages: { stage: string; count: number }[];
  onStageClick?: (stage: string) => void;
}) {
  const top = stages[0]?.count || 1;
  return (
    <div className="space-y-1">
      {stages.map((s, i) => {
        const pctOfTop = (s.count / top) * 100;
        const prev = i > 0 ? stages[i - 1].count : null;
        const drop = prev ? ((prev - s.count) / prev) * 100 : 0;
        return (
          <div key={s.stage}>
            <button
              onClick={onStageClick ? () => onStageClick(s.stage) : undefined}
              disabled={!onStageClick}
              className={cn(
                "grid w-full grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 rounded-neo-sm px-1.5 py-1.5 text-left transition-colors",
                onStageClick && "hover:bg-plane-alt",
              )}
            >
              <span className="truncate text-[0.78rem] text-ink-soft">{s.stage}</span>
              <span className="neo-inset-sm h-4 overflow-hidden rounded-[6px]">
                <span
                  className="block h-full rounded-[6px] transition-[width] duration-700 ease-out"
                  style={{ width: `${pctOfTop}%`, background: SEQ[Math.min(6, i + 1)] }}
                />
              </span>
              <span className="tnum shrink-0 text-[0.8rem] font-semibold text-ink">
                {s.count.toLocaleString("en-IN")}
              </span>
            </button>
            {prev && drop > 0.5 ? (
              <div className="ml-[9.6rem] flex items-center gap-1.5 pb-0.5 pl-1">
                <span className="h-2 w-px bg-engrave" />
                <span className="text-[0.68rem] text-failed">−{drop.toFixed(0)}% drop-off</span>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/* ==========================================================================
   Heatmap — event capacity at a glance. Sequential ramp, one hue, ordered by
   magnitude. Never a rainbow: this encodes "how much", not "which".
   ========================================================================== */

export function HeatmapGrid({
  cells,
  onCellClick,
  legendLow = "Empty",
  legendHigh = "Full",
}: {
  /** `value` is a PERCENTAGE (0–100+). It is printed as-is, not normalised. */
  cells: { id: string; label: string; value: number; hint: string }[];
  onCellClick?: (id: string) => void;
  legendLow?: string;
  legendHigh?: string;
}) {
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  // Colour spreads across the observed range so the grid still differentiates
  // when everything clusters high — but the printed label is always the cell's
  // own percentage. Normalising the label too would report a full event as
  // "83%" whenever some other cell was over 100.
  const max = Math.max(1, ...cells.map((c) => c.value));

  /**
   * Which ordinal step a value lands on. Steps start at 2 so the lowest cell
   * still separates from the surface.
   *
   * The step index is ALL the cell needs — both its background and its ink come
   * from that one number, as a matched pair. Deriving the ink from the value
   * instead is what broke dark mode: the ramp is ordered by magnitude, so it
   * runs light→dark in one theme and dark→light in the other, and a "high
   * value ⇒ white text" rule put white on the palest cells.
   */
  const stepIndex = (v: number) => Math.min(6, Math.max(1, Math.round((v / max) * 6)));

  return (
    <div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(60px,1fr))] gap-1.5">
        {cells.map((c, i) => {
          const n = stepIndex(c.value) + 1; // tokens are 1-indexed
          const bg = `var(--seq-${n})`;
          const ink = `var(--seq-${n}-ink)`;
          return (
            <button
              key={c.id}
              onClick={onCellClick ? () => onCellClick(c.id) : undefined}
              onMouseEnter={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                const p = e.currentTarget.offsetParent?.getBoundingClientRect();
                setHover({ i, x: r.left - (p?.left ?? 0) + r.width / 2, y: r.top - (p?.top ?? 0) });
              }}
              onMouseLeave={() => setHover(null)}
              className="group relative aspect-[4/3] rounded-[7px] p-1.5 text-left transition-transform hover:scale-[1.06] focus-visible:scale-[1.06]"
              style={{ background: bg, color: ink }}
              title={c.hint}
            >
              <span className="block truncate text-[0.6rem] font-semibold leading-tight">
                {c.label}
              </span>
              <span className="tnum absolute bottom-1.5 left-1.5 text-[0.7rem] font-bold">
                {Math.round(c.value)}%
              </span>
            </button>
          );
        })}
      </div>

      {hover != null ? (
        <ChartTooltip x={hover.x} y={hover.y}>
          <div className="font-semibold text-ink">{cells[hover.i].label}</div>
          <div className="text-ink-muted">{cells[hover.i].hint}</div>
        </ChartTooltip>
      ) : null}

      <div className="mt-3 flex items-center gap-2">
        <span className="text-[0.7rem] text-ink-muted">{legendLow}</span>
        <span className="flex h-2 flex-1 overflow-hidden rounded-full">
          {SEQ.slice(1).map((s) => (
            <span key={s} className="flex-1" style={{ background: s }} />
          ))}
        </span>
        <span className="text-[0.7rem] text-ink-muted">{legendHigh}</span>
      </div>
    </div>
  );
}

/* ==========================================================================
   Stacked bar — status composition across categories.
   ========================================================================== */

export function StackedBar({
  rows,
  keys,
  formatValue = (v: number) => v.toLocaleString("en-IN"),
}: {
  rows: { label: string; values: Record<string, number> }[];
  keys: { key: string; label: string; slot: number }[];
  formatValue?: (v: number) => string;
}) {
  const totals = useMemo(
    () => rows.map((r) => keys.reduce((s, k) => s + (r.values[k.key] ?? 0), 0)),
    [rows, keys],
  );
  const max = Math.max(1, ...totals);

  return (
    <div className="space-y-2.5">
      {rows.map((r, ri) => (
        <div key={r.label} className="grid grid-cols-[minmax(0,8rem)_1fr_auto] items-center gap-3">
          <span className="truncate text-[0.78rem] text-ink-soft">{r.label}</span>
          <span
            className="neo-inset-sm flex h-3.5 gap-[2px] overflow-hidden rounded-full p-[2px]"
            style={{ width: `${(totals[ri] / max) * 100}%`, minWidth: 24 }}
          >
            {keys.map((k) => {
              const v = r.values[k.key] ?? 0;
              if (!v) return null;
              return (
                <span
                  key={k.key}
                  className="h-full rounded-full first:rounded-l-full last:rounded-r-full"
                  style={{
                    width: `${(v / (totals[ri] || 1)) * 100}%`,
                    background: seriesColor(k.slot),
                  }}
                  title={`${k.label}: ${formatValue(v)}`}
                />
              );
            })}
          </span>
          <span className="tnum shrink-0 text-[0.78rem] font-semibold text-ink">
            {formatValue(totals[ri])}
          </span>
        </div>
      ))}
    </div>
  );
}
