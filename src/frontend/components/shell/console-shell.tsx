"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { CommandPalette } from "./command-palette";
import { ShortcutsOverlay } from "./shortcuts-overlay";
import { TooltipProvider } from "@/frontend/components/neo";
import { useAsync, useMounted } from "@/frontend/hooks/use-async";
import { useAuth } from "@/frontend/hooks/use-auth";
import { getRepo } from "@/lib/data";
import { NeoSkeleton } from "@/frontend/components/neo";
import { selectedEventId, setSelectedEventId } from "@/lib/data/http/scope";

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
  const [scope, setScope] = useState<string | undefined>();
  const { session, role } = useAuth();

  // getRepo() is called INSIDE the callback, not at render time. The callback
  // only runs from an effect, so the ~14k-record seed is never built during SSR.
  const stats = useAsync(() => getRepo().overview.stats(), []);
  const actor = useAsync(() => getRepo().admin.actor(), []);
  const announcements = useAsync(() => getRepo().overview.announcements(), []);
  const events = useAsync(() => getRepo().events.list(), []);

  useEffect(() => {
    setScope(selectedEventId());
    const onScopeChange = () => setScope(selectedEventId());
    window.addEventListener("registration-console:event-scope", onScopeChange);
    return () => window.removeEventListener("registration-console:event-scope", onScopeChange);
  }, []);

  // A non-global staff member starts on their first assigned event. ADMINs may
  // keep the global "All events" view or narrow it with the selector.
  useEffect(() => {
    if (!session || !events.data?.length) return;
    const isAdmin = session.role === "head" || session.roles?.includes("head");
    const current = selectedEventId();
    if (isAdmin) {
      if (current && !events.data.some((event) => event.id === current)) setSelectedEventId(undefined);
      return;
    }
    if (!current || !events.data.some((event) => event.id === current)) setSelectedEventId(events.data[0].id);
  }, [session, events.data]);

  const refreshLiveData = () => {
    stats.reload();
    announcements.reload();
    events.reload();
    window.dispatchEvent(new CustomEvent("aurora:reload"));
  };

  useEffect(() => {
    // Skip the poll while the tab is hidden. Each tick fans out to every
    // mounted useAsync, so a console left open in a background tab was issuing
    // a burst of authenticated requests every 15 seconds indefinitely — every
    // one of which re-derives the caller's roles against the writer database.
    // The focus listener already refreshes the moment the operator returns.
    const timer = window.setInterval(() => {
      if (!document.hidden) refreshLiveData();
    }, 15_000);
    const onFocus = () => refreshLiveData();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [stats.reload, announcements.reload, events.reload]);

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
            roles={role ? [role] : []}
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar
            onMenu={() => setMobileOpen(true)}
            onOpenPalette={() => setPaletteOpen(true)}
            actor={actor.data ?? undefined}
            announcements={announcements.data}
            events={events.data}
            selectedEventId={scope}
            isAdmin={role === "head"}
            role={role ?? undefined}
            onSelectEvent={setSelectedEventId}
            onReload={refreshLiveData}
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
