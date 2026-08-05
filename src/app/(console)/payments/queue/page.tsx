import type { Metadata } from "next";
import { QueueScreen } from "@/frontend/screens/payments/queue-screen";

export const metadata: Metadata = { title: "Verification queue" };

export default function Page() {
  return <QueueScreen />;
}
