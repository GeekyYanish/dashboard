"use client";

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * Tabs use an engraved underline rather than a raised pill — a raised tab
 * inside an already-raised card would break the surface ladder. The active
 * marker is the one place besides focus rings that signal orange appears in
 * chrome, because "you are here" is genuinely status.
 */
export function NeoTabs<T extends string>({
  value,
  onChange,
  tabs,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  tabs: { value: T; label: ReactNode; count?: number; icon?: ReactNode }[];
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn("flex items-center gap-1 overflow-x-auto border-b border-engrave", className)}
    >
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={cn(
              "relative inline-flex shrink-0 items-center gap-2 px-3.5 py-2.5 text-[0.83rem] font-medium transition-colors",
              active ? "text-ink" : "text-ink-muted hover:text-ink-soft",
            )}
          >
            {t.icon ? (
              <span className="grid place-items-center [&>svg]:size-4" aria-hidden>
                {t.icon}
              </span>
            ) : null}
            {t.label}
            {t.count != null ? (
              <span
                className={cn(
                  "tnum rounded-full px-1.5 py-0.5 text-[0.65rem] font-semibold",
                  active ? "bg-signal-soft text-signal" : "bg-neutral-bg text-ink-muted",
                )}
              >
                {t.count.toLocaleString("en-IN")}
              </span>
            ) : null}
            {active ? (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-signal" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
