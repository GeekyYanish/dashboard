import type { Metadata } from "next";
import { AuditScreen } from "@/frontend/screens/operate/team-audit-screens";

export const metadata: Metadata = { title: "Audit log" };

export default function Page() {
  return <AuditScreen />;
}
