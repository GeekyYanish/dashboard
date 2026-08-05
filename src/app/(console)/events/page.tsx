import type { Metadata } from "next";
import { Suspense } from "react";
import { EventsScreen } from "@/frontend/screens/people/colleges-teams-events";

export const metadata: Metadata = { title: "Events" };

export default function Page() {
  return (
    <Suspense>
      <EventsScreen />
    </Suspense>
  );
}
