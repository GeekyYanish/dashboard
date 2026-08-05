"use client";

import { cn } from "@/lib/utils";
import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { Check, ChevronDown, Minus, Search, X } from "lucide-react";

/* ==========================================================================
   Inputs live in inset wells — the one place neumorphism is unambiguously
   right, because "recessed" is exactly what a text field is.
   ========================================================================== */

interface FieldWrap {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
}

function Field({
  id,
  label,
  hint,
  error,
  required,
  className,
  children,
}: FieldWrap & { id: string; children: ReactNode }) {
  return (
    <div className={cn("min-w-0", className)}>
      {label ? (
        <label htmlFor={id} className="engraved mb-1.5 block">
          {label}
          {required ? <span className="ml-1 text-signal">*</span> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <p className="mt-1.5 text-[0.75rem] font-medium text-failed">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-[0.75rem] text-ink-muted">{hint}</p>
      ) : null}
    </div>
  );
}

const WELL =
  "neo-inset-sm w-full rounded-neo-sm px-3 text-[0.85rem] text-ink placeholder:text-ink-faint " +
  "transition-shadow duration-150 focus:neo-inset outline-none " +
  "disabled:opacity-45 disabled:cursor-not-allowed";

export interface NeoInputProps extends InputHTMLAttributes<HTMLInputElement>, FieldWrap {
  icon?: ReactNode;
  suffix?: ReactNode;
  /** Reference numbers get monospace so they can be compared character by character. */
  mono?: boolean;
}

export const NeoInput = forwardRef<HTMLInputElement, NeoInputProps>(function NeoInput(
  { label, hint, error, required, className, icon, suffix, mono, id, ...rest },
  ref,
) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <Field
      id={inputId}
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={className}
    >
      <div className="relative flex items-center">
        {icon ? (
          <span className="pointer-events-none absolute left-3 grid place-items-center text-ink-faint [&>svg]:size-4">
            {icon}
          </span>
        ) : null}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={!!error}
          className={cn(
            WELL,
            "h-10",
            icon && "pl-9",
            suffix && "pr-10",
            mono && "font-mono tnum text-[0.8rem] tracking-tight",
            error && "shadow-[inset_2px_2px_5px_var(--st-failed-bg),inset_0_0_0_1px_var(--st-failed)]",
          )}
          {...rest}
        />
        {suffix ? (
          <span className="absolute right-3 text-[0.78rem] font-medium text-ink-faint">
            {suffix}
          </span>
        ) : null}
      </div>
    </Field>
  );
});

export interface NeoTextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement>,
    FieldWrap {}

export const NeoTextarea = forwardRef<HTMLTextAreaElement, NeoTextareaProps>(
  function NeoTextarea({ label, hint, error, required, className, id, ...rest }, ref) {
    const auto = useId();
    const areaId = id ?? auto;
    return (
      <Field
        id={areaId}
        label={label}
        hint={hint}
        error={error}
        required={required}
        className={className}
      >
        <textarea
          ref={ref}
          id={areaId}
          aria-invalid={!!error}
          className={cn(WELL, "min-h-[84px] resize-y py-2.5 leading-relaxed")}
          {...rest}
        />
      </Field>
    );
  },
);

export interface NeoSelectProps extends SelectHTMLAttributes<HTMLSelectElement>, FieldWrap {
  options: { value: string; label: string; disabled?: boolean }[];
  placeholder?: string;
}

export const NeoSelect = forwardRef<HTMLSelectElement, NeoSelectProps>(function NeoSelect(
  { label, hint, error, required, className, options, placeholder, id, ...rest },
  ref,
) {
  const auto = useId();
  const selId = id ?? auto;
  return (
    <Field
      id={selId}
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={className}
    >
      <div className="relative">
        <select
          ref={ref}
          id={selId}
          className={cn(WELL, "h-10 cursor-pointer appearance-none pr-9")}
          {...rest}
        >
          {placeholder ? (
            <option value="">{placeholder}</option>
          ) : null}
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint"
          aria-hidden
        />
      </div>
    </Field>
  );
});

/** The console's primary search affordance — a deep well with a clear button. */
export function NeoSearchField({
  value,
  onValueChange,
  placeholder = "Search…",
  className,
  size = "md",
  autoFocus,
  onKeyDown,
}: {
  value: string;
  onValueChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  size?: "md" | "lg";
  autoFocus?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  return (
    <div
      className={cn(
        "neo-inset relative flex items-center rounded-neo",
        size === "lg" ? "h-14" : "h-10",
        className,
      )}
    >
      <Search
        className={cn(
          "pointer-events-none absolute left-4 text-ink-faint",
          size === "lg" ? "size-5" : "size-4",
        )}
        aria-hidden
      />
      <input
        type="search"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onValueChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className={cn(
          "h-full w-full bg-transparent pr-10 text-ink outline-none placeholder:text-ink-faint",
          "[&::-webkit-search-cancel-button]:appearance-none",
          size === "lg" ? "pl-12 text-base" : "pl-10 text-[0.85rem]",
        )}
      />
      {value ? (
        <button
          type="button"
          onClick={() => onValueChange("")}
          aria-label="Clear search"
          className="absolute right-3 grid size-6 place-items-center rounded-full text-ink-faint transition-colors hover:bg-plane hover:text-ink"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

/* ==========================================================================
   The signature control: a raised pill sliding in an inset track.
   ========================================================================== */

export function NeoToggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
  className,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  hint?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "flex items-center justify-between gap-4",
        disabled ? "opacity-45" : "cursor-pointer",
        className,
      )}
    >
      {label || hint ? (
        <span className="min-w-0">
          {label ? <span className="block text-[0.85rem] font-medium text-ink">{label}</span> : null}
          {hint ? <span className="block text-[0.75rem] text-ink-muted">{hint}</span> : null}
        </span>
      ) : null}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "neo-inset relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200",
          checked && "bg-signal-soft",
        )}
      >
        <span
          className={cn(
            "absolute top-1 size-5 rounded-full transition-all duration-250 ease-[cubic-bezier(0.34,1.4,0.64,1)]",
            "shadow-[2px_2px_4px_var(--neo-shadow),-1px_-1px_3px_var(--neo-light)]",
            checked ? "left-6 bg-signal" : "left-1 bg-base",
          )}
        />
      </button>
    </label>
  );
}

export function NeoCheckbox({
  checked,
  indeterminate,
  onChange,
  label,
  disabled,
  className,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (v: boolean) => void;
  label?: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "inline-flex items-center gap-2.5",
        disabled ? "opacity-45" : "cursor-pointer",
        className,
      )}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={indeterminate ? "mixed" : checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "grid size-[18px] shrink-0 place-items-center rounded-[6px] transition-all duration-150",
          checked || indeterminate ? "bg-ink text-canvas" : "neo-inset-sm",
        )}
      >
        {indeterminate ? (
          <Minus className="size-3" strokeWidth={3.5} />
        ) : checked ? (
          <Check className="size-3" strokeWidth={3.5} />
        ) : null}
      </button>
      {label ? <span className="text-[0.85rem] text-ink-soft">{label}</span> : null}
    </label>
  );
}

export function NeoRadio({
  checked,
  onChange,
  label,
  hint,
  disabled,
  className,
}: {
  checked: boolean;
  onChange: () => void;
  label: ReactNode;
  hint?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "flex items-start gap-2.5",
        disabled ? "opacity-45" : "cursor-pointer",
        className,
      )}
    >
      <button
        type="button"
        role="radio"
        aria-checked={checked}
        disabled={disabled}
        onClick={onChange}
        className={cn(
          "mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-full transition-all duration-150",
          checked ? "neo-inset-sm" : "neo-inset-sm",
        )}
      >
        {checked ? <span className="size-2.5 rounded-full bg-signal" /> : null}
      </button>
      <span className="min-w-0">
        <span className="block text-[0.85rem] text-ink-soft">{label}</span>
        {hint ? <span className="block text-[0.75rem] text-ink-muted">{hint}</span> : null}
      </span>
    </label>
  );
}

/* ==========================================================================
   Segmented control — an inset track with one raised, pressed-in segment.
   ========================================================================== */

export function NeoSegmented<T extends string>({
  value,
  onChange,
  options,
  size = "md",
  className,
  fullWidth,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; icon?: ReactNode }[];
  size?: "sm" | "md";
  className?: string;
  fullWidth?: boolean;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "neo-inset inline-flex shrink-0 items-center gap-1 rounded-neo p-1",
        fullWidth && "flex w-full",
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-neo-sm font-medium transition-all duration-200",
              size === "sm" ? "h-7 px-2.5 text-[0.75rem]" : "h-8 px-3.5 text-[0.8rem]",
              fullWidth && "flex-1",
              active
                ? "neo-raised-sm text-ink"
                : "text-ink-muted hover:text-ink-soft",
            )}
          >
            {o.icon ? (
              <span className="grid place-items-center [&>svg]:size-3.5" aria-hidden>
                {o.icon}
              </span>
            ) : null}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function NeoSlider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  format,
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  format?: (v: number) => string;
  className?: string;
}) {
  const filled = ((value - min) / (max - min)) * 100;
  return (
    <div className={cn("min-w-0", className)}>
      {label ? (
        <div className="mb-2 flex items-baseline justify-between">
          <span className="engraved">{label}</span>
          <span className="tnum font-mono text-[0.8rem] font-medium text-ink">
            {format ? format(value) : value}
          </span>
        </div>
      ) : null}
      <div className="neo-inset relative flex h-6 items-center rounded-full px-1">
        <div
          className="pointer-events-none absolute left-1 h-1.5 rounded-full bg-signal/60"
          style={{ width: `calc(${filled}% - ${(filled / 100) * 8}px)` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label={label}
          className={cn(
            "relative z-10 h-6 w-full cursor-pointer appearance-none bg-transparent",
            "[&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full",
            "[&::-webkit-slider-thumb]:bg-base [&::-webkit-slider-thumb]:shadow-[2px_2px_4px_var(--neo-shadow),-1px_-1px_3px_var(--neo-light)]",
            "[&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-base",
          )}
        />
      </div>
    </div>
  );
}
