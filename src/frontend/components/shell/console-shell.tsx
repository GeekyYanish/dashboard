"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { CommandPalette } from "./command-palette";
import { ShortcutsOverlay } from "./shortcuts-overlay";
import { TooltipProvider } from "@/frontend/components/neo";
import { useAsync, useMounted } from "@/frontend/hooks/use-async";
import { getRepo } from "@/lib/data";
import { NeoSkeleton } from "@/frontend/components/neo";

/**
 * The authenticated console frame. `/desk` and `/live` deliberately do NOT use
 * it — a kiosk with a sidebar is a kiosk nobody can use at speed, and a
 * war-room display should be all data and no chrome.
 */
export function ConsoleShell({ children }: { children: ReactNode }) {
  const mounted = useMounted();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // getRepo() is called INSIDE the callback, not at render time. The callback
  // only runs from an effect, so the ~14k-record seed is never built during SSR.
  const stats = useAsync(() => getRepo().overview.stats(), []);
  const actor = useAsync(() => getRepo().admin.actor(), []);
  const announcements = useAsync(() => getRepo().overview.announcements(), []);

  // Global shortcut layer. Everything here is inert while a text field has
  // focus — an operator typing "k" into a search box must not open a modal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement ||
        (el as HTMLElement | null)?.isContentEditable;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (typing) return;
      if (e.key === "?") {
        e.preventDefault();
        setShortcutsOpen(true);
      }
      if (e.key === "/") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <TooltipProvider>
      <div className="flex min-h-dvh">
        <Sidebar
          stats={stats.data}
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar
            onMenu={() => setMobileOpen(true)}
            onOpenPalette={() => setPaletteOpen(true)}
            actor={actor.data}
            announcements={announcements.data}
            onReload={() => {
              stats.reload();
              announcements.reload();
              window.dispatchEvent(new CustomEvent("aurora:reload"));
            }}
          />

          <main className="min-w-0 flex-1 px-3 py-5 sm:px-5 lg:px-7">
            {mounted ? children : <ShellSkeleton />}
          </main>
        </div>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <ShortcutsOverlay open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </TooltipProvider>
  );
}

/**
 * The seeded store builds ~14k records in the browser, so the first paint is
 * client-side. This holds the layout still while that happens rather than
 * letting the page jump.
 */
function ShellSkeleton() {
  return (
    <div className="mx-auto max-w-[1560px] space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <NeoSkeleton key={i} className="h-32 rounded-neo-lg" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <NeoSkeleton className="h-80 rounded-neo-lg lg:col-span-2" />
        <NeoSkeleton className="h-80 rounded-neo-lg" />
      </div>
    </div>
  );
}
