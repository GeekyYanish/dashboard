import type { Metadata } from "next";
import { DrawerScreen } from "@/frontend/screens/payments/finance-screens";

export const metadata: Metadata = { title: "Cash drawer" };

export default function Page() {
  return <DrawerScreen />;
}
