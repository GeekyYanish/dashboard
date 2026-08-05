"use client";

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * L1 — the raised frame. Its Body is L1c, the flat content plane.
 * See ./README.md for why that seam exists.
 */

interface NeoCardProps {
  children: ReactNode;
  className?: string;
  /** Sink the whole card instead of raising it — used for secondary panels. */
  inset?: boolean;
  /** Bigger extrusion; for hero cards only, one per screen at most. */
  elevated?: boolean;
  as?: "div" | "section" | "article";
}

export function NeoCard({
  children,
  className,
  inset,
  elevated,
  as: Tag = "section",
}: NeoCardProps) {
  return (
    <Tag
      className={cn(
        "rounded-neo-lg",
        inset ? "neo-inset" : elevated ? "neo-raised-lg" : "neo-raised",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

interface HeaderProps {
  title?: ReactNode;
  /** Engraved eyebrow above the title — the silkscreen label on a panel. */
  eyebrow?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
  className?: string;
  children?: ReactNode;
}

function Header({ title, eyebrow, subtitle, actions, icon, className, children }: HeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 px-[var(--card-p)] pt-[var(--card-p)] pb-3",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {icon ? (
          <span className="neo-inset-sm mt-0.5 grid size-9 shrink-0 place-items-center rounded-neo-sm text-ink-soft">
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          {eyebrow ? <div className="engraved mb-1">{eyebrow}</div> : null}
          {title ? (
            <h2 className="truncate font-display text-[0.98rem] font-semibold text-ink">{title}</h2>
          ) : null}
          {subtitle ? (
            <p className="mt-0.5 text-[0.8rem] leading-snug text-ink-muted">{subtitle}</p>
          ) : null}
          {children}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/**
 * L1c. Flat, no shadow, lighter tint — tables and dense forms live here so
 * they keep full contrast and paint no shadows per row.
 */
function Body({
  children,
  className,
  flush,
}: {
  children: ReactNode;
  className?: string;
  /** No inner padding — for tables that should meet the card edge. */
  flush?: boolean;
}) {
  return (
    <div
      className={cn(
        "neo-plane overflow-hidden rounded-neo border border-hairline",
        flush ? "" : "p-[var(--card-p)]",
        "mx-[var(--card-p)] mb-[var(--card-p)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Content that stays on the raised surface — charts, stat rows, prose. */
function Raw({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("px-[var(--card-p)] pb-[var(--card-p)]", className)}>{children}</div>;
}

function Footer({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <footer
      className={cn(
        "flex items-center justify-between gap-3 border-t border-engrave px-[var(--card-p)] py-3 text-[0.8rem] text-ink-muted",
        className,
      )}
    >
      {children}
    </footer>
  );
}

NeoCard.Header = Header;
NeoCard.Body = Body;
NeoCard.Raw = Raw;
NeoCard.Footer = Footer;
