import type { Metadata } from "next";
import { Suspense } from "react";
import { ParticipantsScreen } from "@/frontend/screens/people/participants-screen";

export const metadata: Metadata = { title: "Participants" };

export default function Page() {
  return (
    <Suspense>
      <ParticipantsScreen />
    </Suspense>
  );
}
