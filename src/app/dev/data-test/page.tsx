import { notFound } from "next/navigation";
import { DataTestScreen } from "@/frontend/screens/dev/data-test";
import { ConsoleShell } from "@/frontend/components/shell/console-shell";

export const metadata = { title: "Data layer tests" };

export default function Page() {
  // Dev-only. Never reachable in a production build.
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <ConsoleShell>
      <DataTestScreen />
    </ConsoleShell>
  );
}
