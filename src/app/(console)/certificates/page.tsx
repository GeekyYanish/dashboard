import type { Metadata } from "next";
import { CertificatesScreen } from "@/frontend/screens/engage/certificates-helpdesk";

export const metadata: Metadata = { title: "Certificates" };

export default function Page() {
  return <CertificatesScreen />;
}
