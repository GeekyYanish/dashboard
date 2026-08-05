"use client";

import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

/**
 * Used by the CSV import wizard, the refund workflow and the desk's walk-in
 * flow. Completed steps sink (the work is done and filed away); the current
 * step is raised and marked.
 */
export function NeoStepper({
  steps,
  current,
  onStepClick,
  className,
}: {
  steps: { label: string; hint?: string }[];
  current: number;
  onStepClick?: (i: number) => void;
  className?: string;
}) {
  return (
    <ol className={cn("flex items-center gap-1", className)}>
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        const clickable = onStepClick && i <= current;
        return (
          <li key={s.label} className="flex min-w-0 flex-1 items-center gap-2">
            <button
              type="button"
              disabled={!clickable}
              onClick={clickable ? () => onStepClick(i) : undefined}
              className={cn(
                "flex min-w-0 items-center gap-2.5 rounded-neo px-2 py-1.5 text-left transition-all",
                clickable && "hover:bg-plane",
                !clickable && "cursor-default",
              )}
            >
              <span
                className={cn(
                  "tnum grid size-7 shrink-0 place-items-center rounded-full text-[0.72rem] font-bold transition-all",
                  done
                    ? "neo-inset-sm text-paid"
                    : active
                      ? "bg-ink text-canvas"
                      : "neo-inset-sm text-ink-faint",
                )}
              >
                {done ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
              </span>
              <span className="min-w-0">
                <span
                  className={cn(
                    "block truncate text-[0.8rem] font-medium",
                    active ? "text-ink" : done ? "text-ink-soft" : "text-ink-faint",
                  )}
                >
                  {s.label}
                </span>
                {s.hint ? (
                  <span className="block truncate text-[0.7rem] text-ink-muted">{s.hint}</span>
                ) : null}
              </span>
            </button>
            {i < steps.length - 1 ? (
              <span
                className={cn(
                  "h-px min-w-4 flex-1 rounded-full transition-colors",
                  done ? "bg-paid/40" : "bg-engrave",
                )}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
