"use client";

import { cn } from "@/lib/utils";
import { NeoSearchField, NeoPopover, NeoButton, NeoCheckbox, StatusBadge } from "./neo";
import { Filter, X, Bookmark, Columns3 } from "lucide-react";
import type { ReactNode } from "react";

/**
 * One filter row above the table, per the interaction spec. Active facets are
 * echoed back as removable chips so an operator can always see WHY a list is
 * short — the commonest support question a console gets is "where did my rows
 * go", and the answer should be on screen.
 */

export interface Facet {
  key: string;
  label: string;
  options: { value: string; label: string; count?: number }[];
  selected: string[];
}

export function FilterBar({
  search,
  onSearch,
  searchPlaceholder = "Search…",
  facets,
  onFacetChange,
  onClearAll,
  savedViews,
  onApplyView,
  onSaveView,
  columns,
  onColumnToggle,
  actions,
  resultCount,
  totalCount,
}: {
  search: string;
  onSearch: (v: string) => void;
  searchPlaceholder?: string;
  facets: Facet[];
  onFacetChange: (key: string, selected: string[]) => void;
  onClearAll: () => void;
  savedViews?: { id: string; name: string }[];
  onApplyView?: (id: string) => void;
  onSaveView?: () => void;
  columns?: { key: string; label: string; visible: boolean }[];
  onColumnToggle?: (key: string) => void;
  actions?: ReactNode;
  resultCount?: number;
  totalCount?: number;
}) {
  const activeCount = facets.reduce((s, f) => s + f.selected.length, 0);

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <NeoSearchField
          value={search}
          onValueChange={onSearch}
          placeholder={searchPlaceholder}
          className="min-w-[200px] flex-1"
        />

        {facets.map((f) => (
          <NeoPopover
            key={f.key}
            trigger={
              <NeoButton
                size="md"
                variant={f.selected.length ? "primary" : "secondary"}
                icon={<Filter />}
              >
                {f.label}
                {f.selected.length ? ` · ${f.selected.length}` : ""}
              </NeoButton>
            }
            className="w-60"
          >
            <div className="engraved px-2.5 pb-1.5 pt-1">{f.label}</div>
            <div className="max-h-64 overflow-y-auto">
              {f.options.map((o) => (
                <label
                  key={o.value}
                  className="flex cursor-pointer items-center gap-2.5 rounded-neo-sm px-2.5 py-1.5 hover:bg-plane"
                >
                  <NeoCheckbox
                    checked={f.selected.includes(o.value)}
                    onChange={(next) =>
                      onFacetChange(
                        f.key,
                        next
                          ? [...f.selected, o.value]
                          : f.selected.filter((v) => v !== o.value),
                      )
                    }
                  />
                  <span className="min-w-0 flex-1 truncate text-[0.82rem] text-ink-soft">
                    {o.label}
                  </span>
                  {o.count != null ? (
                    <span className="tnum text-[0.72rem] text-ink-faint">{o.count}</span>
                  ) : null}
                </label>
              ))}
            </div>
            {f.selected.length ? (
              <button
                onClick={() => onFacetChange(f.key, [])}
                className="mt-1 w-full rounded-neo-sm px-2.5 py-1.5 text-left text-[0.78rem] text-signal hover:bg-plane"
              >
                Clear {f.label.toLowerCase()}
              </button>
            ) : null}
          </NeoPopover>
        ))}

        {savedViews?.length && onApplyView ? (
          <NeoPopover
            trigger={
              <NeoButton size="md" variant="secondary" icon={<Bookmark />}>
                Views
              </NeoButton>
            }
            className="w-56"
          >
            <div className="engraved px-2.5 pb-1.5 pt-1">Saved views</div>
            {savedViews.map((v) => (
              <button
                key={v.id}
                onClick={() => onApplyView(v.id)}
                className="w-full rounded-neo-sm px-2.5 py-2 text-left text-[0.82rem] text-ink-soft hover:bg-plane hover:text-ink"
              >
                {v.name}
              </button>
            ))}
            {onSaveView ? (
              <>
                <div className="my-1 h-px bg-engrave" />
                <button
                  onClick={onSaveView}
                  className="w-full rounded-neo-sm px-2.5 py-2 text-left text-[0.82rem] font-medium text-signal hover:bg-plane"
                >
                  Save current filters…
                </button>
              </>
            ) : null}
          </NeoPopover>
        ) : null}

        {columns ? (
          <NeoPopover
            trigger={
              <NeoButton size="md" variant="secondary" icon={<Columns3 />}>
                Columns
              </NeoButton>
            }
            className="w-52"
          >
            <div className="engraved px-2.5 pb-1.5 pt-1">Visible columns</div>
            {columns.map((c) => (
              <div
                key={c.key}
                className="flex items-center gap-2.5 rounded-neo-sm px-2.5 py-1.5 hover:bg-plane"
              >
                <NeoCheckbox
                  checked={c.visible}
                  onChange={() => onColumnToggle?.(c.key)}
                  label={c.label}
                />
              </div>
            ))}
          </NeoPopover>
        ) : null}

        {actions}
      </div>

      {activeCount > 0 || search ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="engraved">Filtered</span>
          {search ? (
            <Chip label={`“${search}”`} onRemove={() => onSearch("")} />
          ) : null}
          {facets.flatMap((f) =>
            f.selected.map((v) => (
              <Chip
                key={`${f.key}-${v}`}
                label={`${f.label}: ${f.options.find((o) => o.value === v)?.label ?? v}`}
                onRemove={() => onFacetChange(f.key, f.selected.filter((x) => x !== v))}
              />
            )),
          )}
          <button
            onClick={onClearAll}
            className="ml-1 text-[0.75rem] font-semibold text-signal hover:underline"
          >
            Clear all
          </button>
          {resultCount != null && totalCount != null ? (
            <span className="tnum ml-auto text-[0.75rem] text-ink-muted">
              {resultCount.toLocaleString("en-IN")} of {totalCount.toLocaleString("en-IN")}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-neutral-bg px-2 py-0.5 text-[0.72rem] text-ink-soft">
      {label}
      <button onClick={onRemove} className="text-ink-faint hover:text-ink" aria-label={`Remove ${label}`}>
        <X className="size-3" />
      </button>
    </span>
  );
}

/** Bulk-action bar that slides in when rows are selected. */
export function BulkBar({
  count,
  onClear,
  children,
  className,
}: {
  count: number;
  onClear: () => void;
  children: ReactNode;
  className?: string;
}) {
  if (!count) return null;
  return (
    <div
      className={cn(
        "neo-float sticky bottom-4 z-20 mx-auto flex w-fit max-w-full flex-wrap items-center gap-2 rounded-neo-lg border border-hairline px-3 py-2.5",
        className,
      )}
    >
      <StatusBadge tone="signal" dot={false}>
        {count} selected
      </StatusBadge>
      <span className="h-5 w-px bg-engrave" />
      {children}
      <button
        onClick={onClear}
        className="ml-1 rounded-neo-sm px-2 py-1 text-[0.78rem] text-ink-muted hover:text-ink"
      >
        Clear
      </button>
    </div>
  );
}
