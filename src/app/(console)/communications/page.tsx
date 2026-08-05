import type { Metadata } from "next";
import { CommunicationsScreen } from "@/frontend/screens/engage/communications-screen";

export const metadata: Metadata = { title: "Communications" };

export default function Page() {
  return <CommunicationsScreen />;
}
