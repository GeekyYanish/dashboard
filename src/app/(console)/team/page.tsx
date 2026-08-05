import type { Metadata } from "next";
import { TeamScreen } from "@/frontend/screens/operate/team-audit-screens";

export const metadata: Metadata = { title: "Team & roster" };

export default function Page() {
  return <TeamScreen />;
}
