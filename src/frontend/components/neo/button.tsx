"use client";

import { cn } from "@/lib/utils";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

/**
 * Buttons are graphite, never coloured — colour belongs to status. The only
 * exception is `danger`, where the destructive intent IS the information.
 *
 * Affordance is entirely stateful: lift on hover, press on active, real ring
 * on focus. A soft shadow alone would give a user nothing to read.
 */

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-[0.78rem] gap-1.5 rounded-neo-sm",
  md: "h-10 px-4 text-[0.85rem] gap-2 rounded-neo",
  lg: "h-12 px-6 text-[0.95rem] gap-2.5 rounded-neo",
};

const VARIANTS: Record<Variant, string> = {
  // Graphite slab. Reads as the engraved key on a hardware panel.
  primary:
    "bg-ink text-canvas shadow-[3px_3px_8px_var(--neo-shadow),-2px_-2px_6px_var(--neo-light)] hover:brightness-110 active:shadow-[inset_2px_2px_5px_rgb(0_0_0/0.4)]",
  secondary: "neo-raised-sm text-ink-soft hover:text-ink active:neo-pressed",
  ghost:
    "bg-transparent text-ink-muted shadow-none hover:text-ink hover:bg-plane active:neo-pressed",
  danger:
    "bg-failed text-white shadow-[3px_3px_8px_var(--neo-shadow),-2px_-2px_6px_var(--neo-light)] hover:brightness-110 active:shadow-[inset_2px_2px_5px_rgb(0_0_0/0.35)]",
};

export interface NeoButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
  /** Fills its container — for drawer footers and kiosk keys. */
  block?: boolean;
}

export const NeoButton = forwardRef<HTMLButtonElement, NeoButtonProps>(function NeoButton(
  {
    variant = "secondary",
    size = "md",
    loading,
    icon,
    iconRight,
    block,
    className,
    children,
    disabled,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "relative inline-flex select-none items-center justify-center font-medium",
        "transition-[box-shadow,transform,filter,color,background-color] duration-150",
        "hover:-translate-y-px active:translate-y-0",
        "disabled:pointer-events-none disabled:opacity-45 disabled:shadow-none",
        SIZES[size],
        VARIANTS[variant],
        block && "w-full",
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 className="size-[1.05em] animate-spin" aria-hidden />
      ) : icon ? (
        <span className="grid shrink-0 place-items-center [&>svg]:size-[1.05em]" aria-hidden>
          {icon}
        </span>
      ) : null}
      {children}
      {iconRight && !loading ? (
        <span className="grid shrink-0 place-items-center [&>svg]:size-[1.05em]" aria-hidden>
          {iconRight}
        </span>
      ) : null}
    </button>
  );
});

export interface NeoIconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required — icon-only controls are invisible to screen readers without it. */
  label: string;
  size?: Size;
  variant?: Variant;
  /** Renders in the pressed state, e.g. an active filter toggle. */
  active?: boolean;
}

const ICON_SIZES: Record<Size, string> = {
  sm: "size-8 rounded-neo-sm [&>svg]:size-3.5",
  md: "size-10 rounded-neo [&>svg]:size-4",
  lg: "size-12 rounded-neo [&>svg]:size-5",
};

export const NeoIconButton = forwardRef<HTMLButtonElement, NeoIconButtonProps>(
  function NeoIconButton(
    { label, size = "md", variant = "secondary", active, className, children, ...rest },
    ref,
  ) {
    return (
      <button
        ref={ref}
        aria-label={label}
        title={label}
        aria-pressed={active}
        className={cn(
          "inline-grid shrink-0 place-items-center transition-all duration-150",
          "hover:-translate-y-px active:translate-y-0",
          "disabled:pointer-events-none disabled:opacity-45 disabled:shadow-none",
          ICON_SIZES[size],
          active ? "neo-pressed text-signal" : VARIANTS[variant],
          className,
        )}
        {...rest}
      >
        {children}
      </button>
    );
  },
);
