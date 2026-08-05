import type { Metadata } from "next";
import { OverviewScreen } from "@/frontend/screens/overview";

export const metadata: Metadata = { title: "Command Center" };

export default function Page() {
  return <OverviewScreen />;
}
