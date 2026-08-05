import type { Metadata } from "next";
import { ClashesScreen } from "@/frontend/screens/registrations/hygiene-screens";

export const metadata: Metadata = { title: "Schedule clashes" };

export default function Page() {
  return <ClashesScreen />;
}
