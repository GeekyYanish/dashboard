import { ConsoleShell } from "@/frontend/components/shell/console-shell";
import { AuthGate } from "@/frontend/components/shell/auth-gate";

/**
 * Every module page lives under this group. `/desk` and `/live` sit outside it
 * on purpose — they get their own chrome-free layouts, but the same guard.
 */
export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <ConsoleShell>{children}</ConsoleShell>
    </AuthGate>
  );
}
