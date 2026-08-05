"use client";

import { cn, initials } from "@/lib/utils";
import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

/* ==========================================================================
   Status. The ONE place hue is allowed — see ./README.md, rule 2.
   ========================================================================== */

export type Tone =
  | "paid"
  | "pending"
  | "failed"
  | "waitlist"
  | "neutral"
  | "info"
  | "signal";

const TONE_CLS: Record<Tone, string> = {
  paid: "bg-paid-bg text-paid",
  pending: "bg-pending-bg text-pending",
  failed: "bg-failed-bg text-failed",
  waitlist: "bg-waitlist-bg text-waitlist",
  neutral: "bg-neutral-bg text-neutral",
  info: "bg-info-bg text-info",
  signal: "bg-signal-soft text-signal-ink",
};

const TONE_DOT: Record<Tone, string> = {
  paid: "bg-paid",
  pending: "bg-pending",
  failed: "bg-failed",
  waitlist: "bg-waitlist",
  neutral: "bg-neutral",
  info: "bg-info",
  signal: "bg-signal",
};

export function StatusBadge({
  tone = "neutral",
  children,
  dot = true,
  size = "md",
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  dot?: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full font-semibold whitespace-nowrap",
        size === "sm" ? "px-2 py-0.5 text-[0.68rem]" : "px-2.5 py-1 text-[0.72rem]",
        TONE_CLS[tone],
        className,
      )}
    >
      {dot ? <span className={cn("size-1.5 rounded-full", TONE_DOT[tone])} /> : null}
      {children}
    </span>
  );
}

/** A bare coloured dot with an accessible label — for dense table cells. */
export function ToneDot({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5" title={label}>
      <span className={cn("size-2 shrink-0 rounded-full", TONE_DOT[tone])} />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function LiveDot({ label = "Live" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="relative grid size-2 place-items-center">
        <span className="live-dot absolute size-2 rounded-full bg-signal" />
        <span className="size-1 rounded-full bg-signal" />
      </span>
      <span className="engraved !text-signal">{label}</span>
    </span>
  );
}

/* ==========================================================================
   KPI tile — the hero of the overview. Full neumorphism: this is exactly the
   surface the style flatters.
   ========================================================================== */

export function NeoStatTile({
  label,
  value,
  unit,
  delta,
  deltaLabel,
  /** Higher is worse (dues, failures) — flips the delta's colour meaning. */
  invertDelta,
  icon,
  footer,
  spark,
  onClick,
  className,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  delta?: number;
  deltaLabel?: string;
  invertDelta?: boolean;
  icon?: ReactNode;
  footer?: ReactNode;
  spark?: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const good = delta == null ? null : invertDelta ? delta < 0 : delta > 0;
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={cn(
        "neo-raised group relative flex flex-col gap-3 rounded-neo-lg p-4 text-left",
        onClick &&
          "transition-all duration-200 hover:-translate-y-0.5 hover:neo-raised-lg active:translate-y-0 active:neo-pressed",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="engraved leading-tight">{label}</span>
        {icon ? (
          <span className="neo-inset-sm grid size-7 shrink-0 place-items-center rounded-[9px] text-ink-faint [&>svg]:size-3.5">
            {icon}
          </span>
        ) : null}
      </div>

      <div className="flex items-end gap-1.5">
        <span className="tnum font-display text-[1.85rem] leading-none font-semibold tracking-tight text-ink">
          {value}
        </span>
        {unit ? <span className="mb-0.5 text-[0.8rem] text-ink-muted">{unit}</span> : null}
      </div>

      {spark ? <div className="-mx-1 h-9">{spark}</div> : null}

      {delta != null || footer ? (
        <div className="flex items-center justify-between gap-2">
          {delta != null ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[0.75rem] font-semibold",
                good === null ? "text-ink-muted" : good ? "text-paid" : "text-failed",
              )}
            >
              {delta === 0 ? (
                <Minus className="size-3" />
              ) : delta > 0 ? (
                <ArrowUpRight className="size-3.5" />
              ) : (
                <ArrowDownRight className="size-3.5" />
              )}
              {Math.abs(delta).toFixed(1)}%
            </span>
          ) : (
            <span />
          )}
          {deltaLabel || footer ? (
            <span className="truncate text-[0.72rem] text-ink-muted">{deltaLabel ?? footer}</span>
          ) : null}
        </div>
      ) : null}
    </Tag>
  );
}

/* ==========================================================================
   Progress + gauges
   ========================================================================== */

export function NeoProgress({
  value,
  max = 100,
  tone = "signal",
  label,
  showValue,
  size = "md",
  className,
}: {
  value: number;
  max?: number;
  tone?: Tone;
  label?: string;
  showValue?: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  const p = max <= 0 ? 0 : Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className={cn("min-w-0", className)}>
      {label || showValue ? (
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          {label ? <span className="engraved">{label}</span> : <span />}
          {showValue ? (
            <span className="tnum text-[0.75rem] font-semibold text-ink-soft">
              {Math.round(p)}%
            </span>
          ) : null}
        </div>
      ) : null}
      <div
        className={cn("neo-inset-sm w-full overflow-hidden rounded-full", size === "sm" ? "h-1.5" : "h-2.5")}
        role="progressbar"
        aria-valuenow={Math.round(p)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-700 ease-out", TONE_DOT[tone])}
          style={{ width: `${p}%` }}
        />
      </div>
    </div>
  );
}

/** Circular gauge — an inset dial with a drawn arc. */
export function NeoRing({
  value,
  max = 100,
  size = 96,
  thickness = 9,
  tone = "signal",
  label,
  sublabel,
  className,
}: {
  value: number;
  max?: number;
  size?: number;
  thickness?: number;
  tone?: Tone;
  label?: ReactNode;
  sublabel?: string;
  className?: string;
}) {
  const p = max <= 0 ? 0 : Math.min(1, Math.max(0, value / max));
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const stroke = `var(--st-${tone === "signal" ? "" : tone})`;
  return (
    <div
      className={cn("relative grid shrink-0 place-items-center", className)}
      style={{ width: size, height: size }}
    >
      <div className="neo-inset absolute inset-0 rounded-full" />
      <svg
        width={size}
        height={size}
        className="absolute -rotate-90"
        role="img"
        aria-label={`${Math.round(p * 100)}%${sublabel ? ` ${sublabel}` : ""}`}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--neo-shadow)"
          strokeWidth={thickness}
          opacity={0.35}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tone === "signal" ? "var(--neo-signal)" : stroke}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p)}
          style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <div className="relative z-10 text-center leading-none">
        <div className="tnum font-display text-[1.1rem] font-semibold text-ink">
          {label ?? `${Math.round(p * 100)}%`}
        </div>
        {sublabel ? (
          <div className="engraved mt-1 !text-[0.6rem]">{sublabel}</div>
        ) : null}
      </div>
    </div>
  );
}

/* ==========================================================================
   Avatar + misc
   ========================================================================== */

export function NeoAvatar({
  name,
  size = 34,
  tone,
  className,
}: {
  name: string;
  size?: number;
  tone?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "neo-raised-sm inline-grid shrink-0 place-items-center rounded-full font-semibold text-ink-soft",
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.36, color: tone }}
      aria-hidden
      title={name}
    >
      {initials(name)}
    </span>
  );
}

export function NeoSkeleton({ className }: { className?: string }) {
  return <div className={cn("shimmer rounded-neo-sm", className)} aria-hidden />;
}

/** Key/value row — used throughout the detail drawers. */
export function KeyValue({
  label,
  value,
  mono,
  className,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 py-1.5", className)}>
      <dt className="shrink-0 text-[0.78rem] text-ink-muted">{label}</dt>
      <dd
        className={cn(
          "min-w-0 truncate text-right text-[0.82rem] font-medium text-ink",
          mono && "font-mono tnum text-[0.78rem]",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-14 text-center", className)}>
      {icon ? (
        <span className="neo-inset mb-4 grid size-14 place-items-center rounded-full text-ink-faint [&>svg]:size-6">
          {icon}
        </span>
      ) : null}
      <h3 className="font-display text-[0.95rem] font-semibold text-ink">{title}</h3>
      {hint ? <p className="mt-1.5 max-w-sm text-[0.82rem] text-ink-muted">{hint}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

/** Engraved section rule — the silkscreen divider on a hardware panel. */
export function SectionRule({ label, className }: { label: string; className?: string }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span className="engraved shrink-0">{label}</span>
      <span className="h-px flex-1 bg-engrave" />
    </div>
  );
}
