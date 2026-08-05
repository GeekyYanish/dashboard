import { notFound } from "next/navigation";
import { KitchenSinkScreen } from "@/frontend/screens/dev/kitchen-sink";
import { ConsoleShell } from "@/frontend/components/shell/console-shell";

export const metadata = { title: "Kitchen sink" };

export default function Page() {
  // Dev-only. Never reachable in a production build.
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <ConsoleShell>
      <KitchenSinkScreen />
    </ConsoleShell>
  );
}
