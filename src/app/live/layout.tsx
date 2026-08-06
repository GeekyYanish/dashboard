import type { Metadata } from "next";
import { AuthGate } from "@/frontend/components/shell/auth-gate";

export const metadata: Metadata = { title: "War room" };

/** No console chrome — this is a wall display, not a page you navigate. */
export default function LiveLayout({ children }: { children: React.ReactNode }) {
  return <AuthGate>{children}</AuthGate>;
}
