import type { Metadata } from "next";
import { CheckinScreen } from "@/frontend/screens/desk/checkin-screen";

export const metadata: Metadata = { title: "Check-in" };

export default function Page() {
  return <CheckinScreen />;
}
