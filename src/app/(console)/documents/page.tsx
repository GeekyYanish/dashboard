import type { Metadata } from "next";
import { DocumentsScreen } from "@/frontend/screens/logistics/documents-screen";

export const metadata: Metadata = { title: "Documents" };

export default function Page() {
  return <DocumentsScreen />;
}
