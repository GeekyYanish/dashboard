import { ConsoleShell } from "@/frontend/components/shell/console-shell";
import { AuthGate } from "@/frontend/components/shell/auth-gate";
import { DemoOnlyGate } from "@/frontend/components/shell/demo-only-gate";

/**
 * Every module page lives under this group. `/desk` and `/live` sit outside it
 * on purpose — they get their own chrome-free layouts, but the same guard.
 */
export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <ConsoleShell>
        <DemoOnlyGate>{children}</DemoOnlyGate>
      </ConsoleShell>
    </AuthGate>
  );
}
