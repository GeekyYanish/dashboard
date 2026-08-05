"use client";

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** Standard page frame — one max-width, one rhythm, everywhere. */
export function Page({
  children,
  className,
  wide,
}: {
  children: ReactNode;
  className?: string;
  wide?: boolean;
}) {
  return (
    <div className={cn("mx-auto w-full space-y-4", wide ? "max-w-none" : "max-w-[1560px]", className)}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  children,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {title ? (
          <h2 className="font-display text-[1.3rem] font-semibold tracking-tight text-ink">
            {title}
          </h2>
        ) : null}
        {description ? (
          <p className="mt-1 max-w-2xl text-[0.85rem] leading-relaxed text-ink-muted">
            {description}
          </p>
        ) : null}
        {children}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** Sub-navigation for modules with several screens (payments, registrations). */
export function SubNav({ links }: { links: { href: string; label: string; count?: number }[] }) {
  const pathname = usePathname();
  return (
    <div className="neo-inset flex shrink-0 items-center gap-1 overflow-x-auto rounded-neo p-1">
      {links.map((l) => {
        const active = pathname === l.href;
        return (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-neo-sm px-3 py-1.5 text-[0.8rem] font-medium transition-all duration-200",
              active ? "neo-raised-sm text-ink" : "text-ink-muted hover:text-ink-soft",
            )}
          >
            {l.label}
            {l.count != null ? (
              <span
                className={cn(
                  "tnum rounded-full px-1.5 text-[0.65rem] font-bold",
                  active ? "bg-signal-soft text-signal" : "bg-neutral-bg text-ink-muted",
                )}
              >
                {l.count > 999 ? "999+" : l.count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}

/** Consistent grid for KPI tiles. */
export function StatGrid({ children, cols = 4 }: { children: ReactNode; cols?: 3 | 4 | 5 }) {
  return (
    <div
      className={cn(
        "grid gap-3",
        cols === 3 && "sm:grid-cols-2 lg:grid-cols-3",
        cols === 4 && "sm:grid-cols-2 xl:grid-cols-4",
        cols === 5 && "sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5",
      )}
    >
      {children}
    </div>
  );
}
