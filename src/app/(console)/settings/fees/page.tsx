import type { Metadata } from "next";
import { SettingsScreen } from "@/frontend/screens/operate/settings-screen";

export const metadata: Metadata = { title: "Fees & coupons" };

export default function Page() {
  return <SettingsScreen initialTab="fees" />;
}
