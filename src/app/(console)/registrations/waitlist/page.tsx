import type { Metadata } from "next";
import { WaitlistScreen } from "@/frontend/screens/registrations/hygiene-screens";

export const metadata: Metadata = { title: "Waitlist" };

export default function Page() {
  return <WaitlistScreen />;
}
