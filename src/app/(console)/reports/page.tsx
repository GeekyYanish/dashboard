import type { Metadata } from "next";
import { ReportsScreen } from "@/frontend/screens/operate/reports-screen";

export const metadata: Metadata = { title: "Reports" };

export default function Page() {
  return <ReportsScreen />;
}
