import { ConsoleShell } from "@/frontend/components/shell/console-shell";

/**
 * Every module page lives under this group. `/desk` and `/live` sit outside it
 * on purpose — they get their own chrome-free layouts.
 */
export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return <ConsoleShell>{children}</ConsoleShell>;
}
