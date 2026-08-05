import type { Metadata } from "next";
import { SettingsScreen } from "@/frontend/screens/operate/settings-screen";

export const metadata: Metadata = { title: "Roles & access" };

export default function Page() {
  return <SettingsScreen initialTab="roles" />;
}
