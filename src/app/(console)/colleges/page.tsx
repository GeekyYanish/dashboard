import type { Metadata } from "next";
import { Suspense } from "react";
import { CollegesScreen } from "@/frontend/screens/people/colleges-teams-events";

export const metadata: Metadata = { title: "Colleges" };

export default function Page() {
  return (
    <Suspense>
      <CollegesScreen />
    </Suspense>
  );
}
