import type { Metadata } from "next";
import { DuplicatesScreen } from "@/frontend/screens/registrations/hygiene-screens";

export const metadata: Metadata = { title: "Duplicate participants" };

export default function Page() {
  return <DuplicatesScreen />;
}
