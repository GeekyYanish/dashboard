"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Menu,
  Search,
  CalendarDays,
  Sun,
  Moon,
  Rows3,
  Bell,
  ChevronRight,
  RotateCw,
  KeyRound,
  LogOut,
} from "lucide-react";
import {
  NeoIconButton,
  NeoPopover,
  MenuItem,
  Kbd,
  NeoAvatar,
  StatusBadge,
  SectionRule,
} from "@/frontend/components/neo";
import { usePrefs } from "@/frontend/prefs";
import { useAuth } from "@/frontend/hooks/use-auth";
import { useDaysUntil } from "@/frontend/hooks/use-now";
import { ALL_NAV_ITEMS } from "@/frontend/nav";
import { FEST, roleById } from "@/lib/fest.config";
import type { StaffRoleId } from "@/lib/fest.config";
import { cn, relativeTime } from "@/lib/utils";
import type { Actor } from "@/lib/data/repository";
import type { Announcement, FestEvent } from "@/lib/data/types";

export function Topbar({
  onMenu,
  onOpenPalette,
  actor,
  announcements,
  events,
  selectedEventId,
  isAdmin,
  role,
  onSelectEvent,
  onReload,
}: {
  onMenu: () => void;
  onOpenPalette: () => void;
  actor?: Actor;
  announcements?: Announcement[];
  events?: FestEvent[];
  selectedEventId?: string;
  isAdmin?: boolean;
  role?: StaffRoleId;
  onSelectEvent?: (eventId: string | undefined) => void;
  onReload?: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { theme, toggleTheme, density, setDensity } = usePrefs();
  const { signOut } = useAuth();
  const [mac, setMac] = useState(false);

  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform));
  }, []);

  const current = ALL_NAV_ITEMS.find((i) => i.href === pathname);
  const parent = !current
    ? ALL_NAV_ITEMS.find((i) => i.href !== "/" && pathname.startsWith(i.href))
    : undefined;

  const daysToFest = useDaysUntil(FEST.startsAt);

  return (
    <header
      data-print-hide
      className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b border-hairline bg-canvas/85 px-3 backdrop-blur-md sm:px-5"
    >
      <NeoIconButton label="Open menu" size="sm" variant="ghost" onClick={onMenu} className="lg:hidden">
        <Menu />
      </NeoIconButton>

      {/* Breadcrumb — engraved, like a panel legend. */}
      <div className="flex min-w-0 items-center gap-1.5">
        {parent ? (
          <>
            <Link
              href={parent.href}
              className="truncate text-[0.8rem] text-ink-muted transition-colors hover:text-ink"
            >
              {parent.label}
            </Link>
            <ChevronRight className="size-3.5 shrink-0 text-ink-faint" />
          </>
        ) : null}
        <h1 className="truncate font-display text-[1.02rem] font-semibold text-ink">
          {current?.label ?? parent?.label ?? "Console"}
        </h1>
      </div>

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        {/* Countdown — the number the whole team is working against. */}
        <div className="neo-inset-sm mr-1 hidden items-baseline gap-2 rounded-neo px-3 py-1.5 md:flex">
          <span className="engraved !text-[0.58rem]">Fest in</span>
          <span className="tnum font-display text-[0.95rem] font-bold leading-none text-ink">
            {daysToFest ?? "—"}
          </span>
          <span className="text-[0.7rem] text-ink-muted">days</span>
        </div>

        {events?.length && onSelectEvent ? (
          <label className="neo-inset-sm hidden h-9 max-w-[250px] items-center gap-1.5 rounded-neo px-2 sm:flex">
            <CalendarDays className="size-3.5 shrink-0 text-ink-faint" aria-hidden />
            <span className="sr-only">Event scope</span>
            <select
              aria-label="Event scope"
              value={selectedEventId ?? (isAdmin ? "" : events[0]?.id ?? "")}
              onChange={(event) => onSelectEvent(event.target.value || undefined)}
              className="min-w-0 max-w-[210px] cursor-pointer bg-transparent text-[0.75rem] font-medium text-ink outline-none"
            >
              {isAdmin ? <option value="">All events</option> : null}
              {events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.title}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <button
          onClick={onOpenPalette}
          className="neo-inset-sm hidden h-9 items-center gap-2 rounded-neo pl-3 pr-2 text-[0.8rem] text-ink-faint transition-shadow hover:neo-inset sm:flex"
        >
          <Search className="size-3.5" />
          <span className="hidden lg:inline">Search…</span>
          <Kbd>{mac ? "⌘K" : "^K"}</Kbd>
        </button>

        <NeoIconButton
          label="Search"
          size="sm"
          variant="ghost"
          onClick={onOpenPalette}
          className="sm:hidden"
        >
          <Search />
        </NeoIconButton>

        {onReload ? (
          <NeoIconButton label="Refresh data" size="sm" variant="ghost" onClick={onReload}>
            <RotateCw />
          </NeoIconButton>
        ) : null}

        <NeoPopover
          align="end"
          trigger={
            <NeoIconButton label="Announcements" size="sm" variant="ghost" className="relative">
              <Bell />
              {announcements?.length ? (
                <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-signal" />
              ) : null}
            </NeoIconButton>
          }
          className="w-[340px]"
        >
          <div className="px-2 pb-1 pt-1.5">
            <SectionRule label="Announcements" />
          </div>
          {announcements?.length ? (
            announcements.map((a) => (
              <div key={a.id} className="rounded-neo-sm px-2.5 py-2 hover:bg-plane">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <StatusBadge
                    size="sm"
                    tone={
                      a.severity === "critical"
                        ? "failed"
                        : a.severity === "warning"
                          ? "pending"
                          : a.severity === "success"
                            ? "paid"
                            : "info"
                    }
                  >
                    {a.severity}
                  </StatusBadge>
                  <span className="text-[0.68rem] text-ink-faint">
                    {relativeTime(a.publishedAt)}
                  </span>
                </div>
                <p className="text-[0.82rem] font-medium text-ink">{a.title}</p>
                <p className="mt-0.5 text-[0.75rem] leading-snug text-ink-muted">{a.body}</p>
              </div>
            ))
          ) : (
            <p className="px-3 py-6 text-center text-[0.8rem] text-ink-muted">Nothing new.</p>
          )}
        </NeoPopover>

        <NeoIconButton
          label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          size="sm"
          variant="ghost"
          onClick={toggleTheme}
        >
          {theme === "dark" ? <Sun /> : <Moon />}
        </NeoIconButton>

        <NeoPopover
          align="end"
          trigger={
            <NeoIconButton label="Display density" size="sm" variant="ghost">
              <Rows3 />
            </NeoIconButton>
          }
          className="w-52"
        >
          <div className="engraved px-2.5 pb-1 pt-1.5">Row density</div>
          {(["compact", "default", "roomy"] as const).map((d) => (
            <MenuItem key={d} onClick={() => setDensity(d)}>
              <span className={cn("capitalize", density === d && "font-semibold text-ink")}>
                {d}
                {density === d ? " ✓" : ""}
              </span>
            </MenuItem>
          ))}
        </NeoPopover>

        {actor ? (
          <NeoPopover
            align="end"
            trigger={
              <button className="ml-0.5 flex items-center gap-2 rounded-full transition-transform hover:-translate-y-px">
                <NeoAvatar name={actor.name} size={34} />
              </button>
            }
            className="w-60"
          >
            <div className="px-2.5 py-2">
              <p className="text-[0.85rem] font-semibold text-ink">{actor.name}</p>
              <p className="text-[0.72rem] text-ink-muted">
                {roleById((role ?? actor.role) as never)?.label ?? (role ?? actor.role)}
              </p>
            </div>
            <div className="my-1 h-px bg-engrave" />
            <MenuItem onClick={() => router.push("/settings")}>Settings</MenuItem>
            <MenuItem icon={<KeyRound />} onClick={() => router.push("/login/set-password")}>
              Change password
            </MenuItem>
            <MenuItem onClick={() => router.push("/audit")}>My activity</MenuItem>
            <div className="my-1 h-px bg-engrave" />
            <MenuItem
              icon={<LogOut />}
              danger
              onClick={async () => {
                await signOut();
                router.replace("/login");
              }}
            >
              Sign out
            </MenuItem>
          </NeoPopover>
        ) : null}
      </div>
    </header>
  );
}
