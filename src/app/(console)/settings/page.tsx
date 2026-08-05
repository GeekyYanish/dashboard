import type { Metadata } from "next";
import { SettingsScreen } from "@/frontend/screens/operate/settings-screen";

export const metadata: Metadata = { title: "Settings" };

export default function Page() {
  return <SettingsScreen />;
}
