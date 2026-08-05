import type { Metadata } from "next";
import { TravelScreen } from "@/frontend/screens/logistics/travel-screen";

export const metadata: Metadata = { title: "Travel & arrivals" };

export default function Page() {
  return <TravelScreen />;
}
