import type { Metadata } from "next";
import { DuesScreen } from "@/frontend/screens/payments/finance-screens";

export const metadata: Metadata = { title: "Outstanding dues" };

export default function Page() {
  return <DuesScreen />;
}
