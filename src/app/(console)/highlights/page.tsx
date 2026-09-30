import type { Metadata } from "next";
import { HighlightsScreen } from "@/frontend/screens/operate/highlights-screen";

export const metadata: Metadata = { title: "Fest Highlights" };

export default function Page() {
  return <HighlightsScreen />;
}
