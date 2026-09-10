"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { isDemoOnlyRoute } from "@/frontend/nav";
import { hasApiBackend } from "@/lib/data/http/api-client";

/**
 * Blocks screens that have no backend behind them.
 *
 * Thirteen of the console's repository slices still read the seeded in-browser
 * store. Hiding those entries from the sidebar is not enough on its own: a
 * bookmark, a browser-history entry or a pasted link would still land on a
 * screen full of invented rows that look exactly like the real ones. This is
 * the check that actually holds.
 *
 * Deliberately a rendered notice rather than notFound(): "this isn't wired up
 * yet" is the truth, and a bare 404 would read as a broken console.
 */
export function DemoOnlyGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (!hasApiBackend() || !isDemoOnlyRoute(pathname)) return <>{children}</>;

  return (
    <div className="grid min-h-[60vh] place-items-center p-6 text-center">
      <div className="max-w-[46ch]">
        <p className="text-[0.95rem] font-semibold text-ink">Not connected yet</p>
        <p className="mt-2 text-[0.82rem] leading-relaxed text-ink-muted">
          This screen has no backend behind it. It is hidden while the console is
          running against live data so nobody acts on figures that were generated
          in the browser.
        </p>
        <p className="mt-3 text-[0.75rem] text-ink-faint">
          It returns as soon as the API serves this module.
        </p>
      </div>
    </div>
  );
}
