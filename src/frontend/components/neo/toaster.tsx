"use client";

import { Toaster as Sonner, toast as sonnerToast } from "sonner";
import { CheckCircle2, AlertTriangle, XCircle, Info, Undo2 } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Toasts are the console's mutation receipt. Every write says what happened,
 * and destructive ones offer an undo — the operator is working fast and will
 * mis-click.
 */
export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      offset={20}
      gap={10}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "neo-float flex w-[360px] items-start gap-3 rounded-neo border border-hairline p-3.5 text-ink",
          title: "text-[0.85rem] font-semibold leading-snug",
          description: "text-[0.78rem] text-ink-muted leading-snug mt-0.5",
          actionButton:
            "neo-raised-sm ml-auto shrink-0 rounded-neo-sm px-2.5 h-7 text-[0.75rem] font-semibold text-ink",
          cancelButton: "text-[0.75rem] text-ink-muted px-2",
        },
      }}
      icons={{
        success: <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-paid" />,
        error: <XCircle className="mt-0.5 size-4 shrink-0 text-failed" />,
        warning: <AlertTriangle className="mt-0.5 size-4 shrink-0 text-pending" />,
        info: <Info className="mt-0.5 size-4 shrink-0 text-info" />,
      }}
    />
  );
}

/** Thin wrapper so call sites never import sonner directly. */
export const toast = {
  success: (title: string, description?: string) => sonnerToast.success(title, { description }),
  error: (title: string, description?: string) => sonnerToast.error(title, { description }),
  warning: (title: string, description?: string) => sonnerToast.warning(title, { description }),
  info: (title: string, description?: string) => sonnerToast.info(title, { description }),
  /** For any mutation the operator might regret. */
  undoable: (title: string, description: string | undefined, onUndo: () => void) =>
    sonnerToast.success(title, {
      description,
      duration: 7000,
      action: { label: "Undo", onClick: onUndo },
    }),
  promise: <T,>(
    p: Promise<T>,
    msgs: { loading: string; success: string | ((d: T) => string); error: string },
  ) => sonnerToast.promise(p, msgs),
  custom: (node: ReactNode) => sonnerToast.custom(() => node as React.ReactElement),
};

export { Undo2 };
