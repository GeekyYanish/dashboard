import type { Metadata } from "next";
import { ImportScreen } from "@/frontend/screens/registrations/import-screen";

export const metadata: Metadata = { title: "Import registrations" };

export default function Page() {
  return <ImportScreen />;
}
