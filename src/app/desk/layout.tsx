import type { Metadata } from "next";
import { TooltipProvider } from "@/frontend/components/neo";

export const metadata: Metadata = { title: "On-spot desk" };

/**
 * The kiosk gets its own layout — no sidebar, no breadcrumbs. A desk running
 * a queue of forty people needs the whole screen and zero navigation chrome.
 */
export default function DeskLayout({ children }: { children: React.ReactNode }) {
  return <TooltipProvider>{children}</TooltipProvider>;
}
