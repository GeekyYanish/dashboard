import type { Metadata } from "next";
import { Suspense } from "react";
import { TeamsScreen } from "@/frontend/screens/people/colleges-teams-events";

export const metadata: Metadata = { title: "Teams" };

export default function Page() {
  return (
    <Suspense>
      <TeamsScreen />
    </Suspense>
  );
}
