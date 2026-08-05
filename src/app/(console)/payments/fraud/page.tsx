import type { Metadata } from "next";
import { FraudScreen } from "@/frontend/screens/payments/finance-screens";

export const metadata: Metadata = { title: "Flagged payments" };

export default function Page() {
  return <FraudScreen />;
}
