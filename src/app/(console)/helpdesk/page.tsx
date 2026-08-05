import type { Metadata } from "next";
import { HelpdeskScreen } from "@/frontend/screens/engage/certificates-helpdesk";

export const metadata: Metadata = { title: "Helpdesk" };

export default function Page() {
  return <HelpdeskScreen />;
}
