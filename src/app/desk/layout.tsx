import type { Metadata } from "next";
import { TooltipProvider } from "@/frontend/components/neo";
import { AuthGate } from "@/frontend/components/shell/auth-gate";

export const metadata: Metadata = { title: "On-spot desk" };

/**
 * The kiosk gets its own layout — no sidebar, no breadcrumbs. A desk running a
 * queue of forty people needs the whole screen and zero navigation chrome. It
 * still sits behind the same auth guard: a kiosk that takes cash without
 * knowing who is operating it is worse than no kiosk.
 */
export default function DeskLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <TooltipProvider>{children}</TooltipProvider>
    </AuthGate>
  );
}
