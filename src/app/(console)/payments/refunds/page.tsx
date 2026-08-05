import type { Metadata } from "next";
import { RefundsScreen } from "@/frontend/screens/payments/finance-screens";

export const metadata: Metadata = { title: "Refunds" };

export default function Page() {
  return <RefundsScreen />;
}
