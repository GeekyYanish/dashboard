import type { Metadata } from "next";
import { LedgerScreen } from "@/frontend/screens/payments/ledger-screen";

export const metadata: Metadata = { title: "Payment ledger" };

export default function Page() {
  return <LedgerScreen />;
}
