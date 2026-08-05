import type { Metadata } from "next";
import { RegistrationsScreen } from "@/frontend/screens/registrations/registrations-screen";

export const metadata: Metadata = { title: "Registrations" };

export default function Page() {
  return <RegistrationsScreen />;
}
