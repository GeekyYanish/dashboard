"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { NAV, isActive } from "@/frontend/nav";
import { FEST } from "@/lib/fest.config";
import { NeoTooltip, NeoIconButton } from "@/frontend/components/neo";
import { PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import type { OverviewStats } from "@/lib/data/types";

/**
 * The sidebar is where the neumorphism is most literal — a machined control
 * panel bolted to the left of the screen. The active item is *pressed in*,
 * which is the whole idea: the control you last used stays depressed.
 */
export function Sidebar({
  stats,
  mobileOpen,
  onMobileClose,
}: {
  stats?: OverviewStats;
  mobileOpen: boolean;
  onMobileClose: () => void;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const body = (
    <>
      <div
        className={cn(
          "flex items-center gap-2.5 px-4 py-4",
          collapsed && "justify-center px-0",
        )}
      >
        <Link
          href="/"
          className="flex min-w-0 items-center gap-2.5"
          onClick={onMobileClose}
        >
          {/* Brand mark — one of the two places signal orange is allowed. */}
          <span className="neo-raised-sm grid size-9 shrink-0 place-items-center rounded-neo-sm">
            <span className="block size-3 rounded-[3px] bg-signal" />
          </span>
          {!collapsed && (
            <span className="min-w-0">
              <span className="block truncate font-display text-[0.95rem] font-bold leading-none tracking-tight text-ink">
                {FEST.name}
                <span className="text-signal">{FEST.edition}</span>
              </span>
              <span className="engraved mt-1 block !text-[0.58rem]">Registration</span>
            </span>
          )}
        </Link>
        <button
          onClick={onMobileClose}
          className="ml-auto grid size-8 place-items-center rounded-neo-sm text-ink-muted lg:hidden"
          aria-label="Close menu"
        >
          <X className="size-4" />
        </button>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {NAV.map((section) => (
          <div key={section.label} className="mb-4">
            {!collapsed && <div className="engraved mb-1.5 px-2">{section.label}</div>}
            {collapsed && <div className="mx-auto mb-2 h-px w-6 bg-engrave" />}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(pathname, item);
                const count = item.badge && stats ? stats[item.badge] : undefined;
                const link = (
                  <Link
                    href={item.href}
                    onClick={onMobileClose}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex items-center gap-2.5 rounded-neo px-2.5 py-2 text-[0.83rem] font-medium transition-all duration-200",
                      collapsed && "justify-center px-0",
                      active
                        ? "neo-pressed text-ink"
                        : "text-ink-muted hover:bg-plane hover:text-ink",
                    )}
                  >
                    {/* Active marker — a machined indicator, not a fill. */}
                    {active && !collapsed ? (
                      <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-signal" />
                    ) : null}
                    <item.icon
                      className={cn("size-4 shrink-0", active && "text-signal")}
                      strokeWidth={active ? 2.4 : 2}
                    />
                    {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
                    {!collapsed && count ? (
                      <span
                        className={cn(
                          "tnum rounded-full px-1.5 py-0.5 text-[0.65rem] font-bold",
                          count > 0 ? "bg-pending-bg text-pending" : "bg-neutral-bg text-ink-muted",
                        )}
                      >
                        {count > 999 ? "999+" : count}
                      </span>
                    ) : null}
                    {collapsed && count ? (
                      <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-pending" />
                    ) : null}
                  </Link>
                );
                return (
                  <li key={item.href}>
                    {collapsed ? (
                      <NeoTooltip content={item.label} side="right">
                        {link}
                      </NeoTooltip>
                    ) : (
                      link
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className={cn("border-t border-engrave p-3", collapsed && "flex justify-center")}>
        <NeoIconButton
          label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          size="sm"
          variant="ghost"
          onClick={() => setCollapsed((c) => !c)}
          className="hidden lg:inline-grid"
        >
          {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
        </NeoIconButton>
        {!collapsed && (
          <p className="mt-2 px-1 text-[0.68rem] leading-relaxed text-ink-faint">
            {FEST.tagline}
            <br />
            {FEST.days.length} days · {FEST.city}
          </p>
        )}
      </div>
    </>
  );

  return (
    <>
      {/* Mobile scrim */}
      {mobileOpen ? (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          style={{ background: "var(--neo-scrim)" }}
          onClick={onMobileClose}
          aria-hidden
        />
      ) : null}

      <aside
        data-print-hide
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col border-r border-hairline bg-canvas transition-[width,transform] duration-300",
          collapsed ? "lg:w-[68px]" : "lg:w-[232px]",
          "w-[262px]",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        {body}
      </aside>
      {/* Spacer so content is never under the fixed rail. */}
      <div
        aria-hidden
        className={cn("hidden shrink-0 transition-[width] duration-300 lg:block", collapsed ? "w-[68px]" : "w-[232px]")}
      />
    </>
  );
}
