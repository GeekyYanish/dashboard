import type { Metadata } from "next";
import { SettlementsScreen } from "@/frontend/screens/payments/finance-screens";

export const metadata: Metadata = { title: "Bank reconciliation" };

export default function Page() {
  return <SettlementsScreen />;
}
