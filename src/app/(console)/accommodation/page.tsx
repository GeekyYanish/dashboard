import type { Metadata } from "next";
import { AccommodationScreen } from "@/frontend/screens/logistics/accommodation-screen";

export const metadata: Metadata = { title: "Accommodation" };

export default function Page() {
  return <AccommodationScreen />;
}
