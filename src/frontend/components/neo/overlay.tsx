"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { NeoIconButton } from "./button";

/**
 * L2 — floating surfaces. These are the one level allowed a real drop shadow:
 * they sit above the panel rather than being machined into it, so the soft
 * dual-shadow language would read as flat here.
 *
 * Radix handles focus trapping, scroll lock and escape; all of it is reskinned.
 */

export function NeoModal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const width = {
    sm: "max-w-md",
    md: "max-w-xl",
    lg: "max-w-3xl",
    xl: "max-w-5xl",
  }[size];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-50 backdrop-blur-[2px] data-[state=open]:animate-[neo-rise_0.2s_ease-out]"
          style={{ background: "var(--neo-scrim)" }}
        />
        <Dialog.Content
          className={cn(
            "neo-float fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2",
            "flex-col overflow-hidden rounded-neo-lg border border-hairline",
            "data-[state=open]:animate-[neo-rise_0.24s_cubic-bezier(0.22,1,0.36,1)]",
            width,
          )}
        >
          <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-3">
            <div className="min-w-0">
              <Dialog.Title className="font-display text-[1.05rem] font-semibold text-ink">
                {title}
              </Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-1 text-[0.82rem] text-ink-muted">
                  {description}
                </Dialog.Description>
              ) : null}
            </div>
            <Dialog.Close asChild>
              <NeoIconButton label="Close" size="sm" variant="ghost">
                <X />
              </NeoIconButton>
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-5">{children}</div>
          {footer ? (
            <div className="flex items-center justify-end gap-2 border-t border-engrave px-6 py-4">
              {footer}
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * Side drawer — the console's main detail surface. Registrations, participants
 * and payments all open here rather than navigating, so the operator never
 * loses their place in a filtered list.
 */
export function NeoDrawer({
  open,
  onOpenChange,
  title,
  eyebrow,
  children,
  footer,
  width = "md",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: ReactNode;
  eyebrow?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: "md" | "lg" | "xl";
}) {
  const w = {
    md: "sm:max-w-md",
    lg: "sm:max-w-xl",
    xl: "sm:max-w-3xl",
  }[width];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-50 backdrop-blur-[2px]"
          style={{ background: "var(--neo-scrim)" }}
        />
        <Dialog.Content
          className={cn(
            "fixed right-0 top-0 z-50 flex h-full w-full flex-col bg-canvas shadow-[var(--neo-float-shadow)]",
            "border-l border-hairline outline-none",
            "data-[state=open]:animate-[drawer-in_0.28s_cubic-bezier(0.22,1,0.36,1)]",
            w,
          )}
        >
          <style>{`@keyframes drawer-in{from{transform:translateX(16px);opacity:0}to{transform:none;opacity:1}}`}</style>
          <div className="flex items-start justify-between gap-4 border-b border-engrave px-5 py-4">
            <div className="min-w-0">
              {eyebrow ? <div className="engraved mb-1">{eyebrow}</div> : null}
              <Dialog.Title className="truncate font-display text-[1.02rem] font-semibold text-ink">
                {title}
              </Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <NeoIconButton label="Close" size="sm" variant="ghost">
                <X />
              </NeoIconButton>
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
          {footer ? (
            <div className="flex items-center justify-end gap-2 border-t border-engrave px-5 py-4">
              {footer}
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function NeoPopover({
  trigger,
  children,
  align = "end",
  className,
  open,
  onOpenChange,
}: {
  trigger: ReactNode;
  children: ReactNode;
  align?: "start" | "center" | "end";
  className?: string;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
}) {
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align={align}
          sideOffset={8}
          collisionPadding={12}
          className={cn(
            "neo-float z-50 max-h-[70vh] overflow-y-auto rounded-neo border border-hairline p-2",
            "data-[state=open]:animate-[neo-rise_0.18s_ease-out]",
            className,
          )}
        >
          {children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

/** A menu row inside a popover. */
export function MenuItem({
  icon,
  children,
  onClick,
  danger,
  disabled,
  shortcut,
}: {
  icon?: ReactNode;
  children: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  shortcut?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-neo-sm px-2.5 py-2 text-left text-[0.82rem] transition-colors",
        "hover:bg-plane disabled:pointer-events-none disabled:opacity-40",
        danger ? "text-failed" : "text-ink-soft hover:text-ink",
      )}
    >
      {icon ? (
        <span className="grid shrink-0 place-items-center [&>svg]:size-4" aria-hidden>
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {shortcut ? <Kbd>{shortcut}</Kbd> : null}
    </button>
  );
}

export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <TooltipPrimitive.Provider delayDuration={300} skipDelayDuration={120}>
      {children}
    </TooltipPrimitive.Provider>
  );
}

export function NeoTooltip({
  content,
  children,
  side = "top",
}: {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
}) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          collisionPadding={10}
          className="neo-float z-50 max-w-xs rounded-neo-sm border border-hairline px-2.5 py-1.5 text-[0.75rem] leading-snug text-ink"
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="neo-raised-sm inline-grid h-5 min-w-5 shrink-0 place-items-center rounded-[5px] px-1.5 font-mono text-[0.65rem] font-medium text-ink-muted">
      {children}
    </kbd>
  );
}
