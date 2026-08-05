"use client";

import { cn } from "@/lib/utils";
import {
  useMemo,
  useState,
  type ReactNode,
  Fragment,
  useCallback,
  useRef,
  useEffect,
} from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { NeoCheckbox } from "./controls";
import { NeoSkeleton, EmptyState } from "./display";

/**
 * L1c — the content plane. FLAT by design.
 *
 * Rows carry no shadow. That is not a shortcut: at 3,000 rows, two shadow
 * passes per row is real paint cost, and extruded surfaces stop separating
 * from each other exactly when there are most of them. Hairlines and a
 * hovered tint do the work instead. See ./README.md, rule 1.
 */

export interface Column<T> {
  key: string;
  header: ReactNode;
  /** Cell renderer. Keep it cheap — this runs per visible row. */
  cell: (row: T, index: number) => ReactNode;
  /** Value used for sorting. Omit to make the column unsortable. */
  sortValue?: (row: T) => string | number;
  width?: string;
  align?: "left" | "right" | "center";
  /** Hidden on narrow viewports. */
  hideBelow?: "sm" | "md" | "lg";
  /** Excluded by default from the column picker's visible set. */
  optional?: boolean;
}

export type SortState = { key: string; dir: "asc" | "desc" } | null;

interface DataTableProps<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  loading?: boolean;
  /** Enables the checkbox column. */
  selected?: Set<string>;
  onSelectedChange?: (next: Set<string>) => void;
  onRowClick?: (row: T) => void;
  sort?: SortState;
  onSortChange?: (s: SortState) => void;
  /** Column keys to show; undefined = all non-optional. */
  visibleColumns?: string[];
  pageSize?: number;
  empty?: ReactNode;
  /** Renders under a row when expanded — used by the reconciliation matcher. */
  renderSubRow?: (row: T) => ReactNode;
  expandedKeys?: Set<string>;
  className?: string;
  /** Highlights the row under the keyboard cursor (J/K navigation). */
  cursorKey?: string | null;
  stickyHeader?: boolean;
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  loading,
  selected,
  onSelectedChange,
  onRowClick,
  sort,
  onSortChange,
  visibleColumns,
  pageSize = 25,
  empty,
  renderSubRow,
  expandedKeys,
  className,
  cursorKey,
  stickyHeader = true,
}: DataTableProps<T>) {
  const [page, setPage] = useState(0);
  const cursorRef = useRef<HTMLTableRowElement>(null);

  const cols = useMemo(
    () =>
      visibleColumns
        ? columns.filter((c) => visibleColumns.includes(c.key))
        : columns.filter((c) => !c.optional),
    [columns, visibleColumns],
  );

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      if (av === bv) return 0;
      return (av > bv ? 1 : -1) * dir;
    });
  }, [rows, sort, columns]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = useMemo(
    () => sorted.slice(safePage * pageSize, safePage * pageSize + pageSize),
    [sorted, safePage, pageSize],
  );

  // Reset to the first page whenever the underlying set changes size — a
  // filter that shrinks the list must not strand the operator on page 9.
  useEffect(() => {
    setPage(0);
  }, [rows.length]);

  useEffect(() => {
    cursorRef.current?.scrollIntoView({ block: "nearest" });
  }, [cursorKey]);

  const allOnPageSelected =
    !!selected && pageRows.length > 0 && pageRows.every((r) => selected.has(rowKey(r)));
  const someOnPageSelected =
    !!selected && pageRows.some((r) => selected.has(rowKey(r))) && !allOnPageSelected;

  const toggleAll = useCallback(() => {
    if (!selected || !onSelectedChange) return;
    const next = new Set(selected);
    if (allOnPageSelected) pageRows.forEach((r) => next.delete(rowKey(r)));
    else pageRows.forEach((r) => next.add(rowKey(r)));
    onSelectedChange(next);
  }, [selected, onSelectedChange, allOnPageSelected, pageRows, rowKey]);

  const toggleOne = useCallback(
    (id: string) => {
      if (!selected || !onSelectedChange) return;
      const next = new Set(selected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      onSelectedChange(next);
    },
    [selected, onSelectedChange],
  );

  const headClick = (c: Column<T>) => {
    if (!c.sortValue || !onSortChange) return;
    if (sort?.key !== c.key) onSortChange({ key: c.key, dir: "asc" });
    else if (sort.dir === "asc") onSortChange({ key: c.key, dir: "desc" });
    else onSortChange(null);
  };

  const HIDE = { sm: "hidden sm:table-cell", md: "hidden md:table-cell", lg: "hidden lg:table-cell" };

  if (loading) {
    return (
      <div className={cn("p-3", className)}>
        {Array.from({ length: 8 }).map((_, i) => (
          <NeoSkeleton key={i} className="mb-2 h-[var(--row-h)] w-full" />
        ))}
      </div>
    );
  }

  if (!sorted.length) {
    return <div className={className}>{empty ?? <EmptyState title="Nothing here yet" />}</div>;
  }

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-left">
          <thead
            className={cn(
              "z-10 bg-plane",
              stickyHeader && "sticky top-0",
            )}
          >
            <tr className="border-b border-hairline">
              {selected && onSelectedChange ? (
                <th className="w-10 px-3 py-2">
                  <NeoCheckbox
                    checked={allOnPageSelected}
                    indeterminate={someOnPageSelected}
                    onChange={toggleAll}
                  />
                  <span className="sr-only">Select all rows on this page</span>
                </th>
              ) : null}
              {cols.map((c) => {
                const active = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    style={{ width: c.width }}
                    className={cn(
                      "engraved px-[var(--cell-px)] py-2.5 whitespace-nowrap",
                      c.align === "right" && "text-right",
                      c.align === "center" && "text-center",
                      c.hideBelow && HIDE[c.hideBelow],
                    )}
                  >
                    {c.sortValue ? (
                      <button
                        onClick={() => headClick(c)}
                        className={cn(
                          "inline-flex items-center gap-1 transition-colors hover:text-ink",
                          active && "!text-ink",
                          c.align === "right" && "flex-row-reverse",
                        )}
                      >
                        {c.header}
                        {active ? (
                          sort.dir === "asc" ? (
                            <ArrowUp className="size-3" />
                          ) : (
                            <ArrowDown className="size-3" />
                          )
                        ) : (
                          <ChevronsUpDown className="size-3 opacity-40" />
                        )}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, i) => {
              const id = rowKey(row);
              const isSel = selected?.has(id);
              const isCursor = cursorKey === id;
              return (
                <Fragment key={id}>
                  <tr
                    ref={isCursor ? cursorRef : undefined}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn(
                      "border-b border-hairline/70 transition-colors",
                      onRowClick && "cursor-pointer",
                      isSel ? "bg-signal-soft/50" : "hover:bg-plane-alt",
                      isCursor && "outline outline-2 -outline-offset-2 outline-signal",
                    )}
                    style={{ height: "var(--row-h)" }}
                  >
                    {selected && onSelectedChange ? (
                      <td
                        className="px-3"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleOne(id);
                        }}
                      >
                        <NeoCheckbox checked={!!isSel} onChange={() => toggleOne(id)} />
                      </td>
                    ) : null}
                    {cols.map((c) => (
                      <td
                        key={c.key}
                        className={cn(
                          "px-[var(--cell-px)] text-[0.82rem] text-ink-soft",
                          c.align === "right" && "text-right",
                          c.align === "center" && "text-center",
                          c.hideBelow && HIDE[c.hideBelow],
                        )}
                      >
                        {c.cell(row, safePage * pageSize + i)}
                      </td>
                    ))}
                  </tr>
                  {renderSubRow && expandedKeys?.has(id) ? (
                    <tr className="border-b border-hairline bg-plane-alt">
                      <td colSpan={cols.length + (selected ? 1 : 0)} className="p-0">
                        {renderSubRow(row)}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {pageCount > 1 ? (
        <Pagination
          page={safePage}
          pageCount={pageCount}
          total={sorted.length}
          pageSize={pageSize}
          onChange={setPage}
        />
      ) : (
        <div className="border-t border-hairline px-[var(--cell-px)] py-2 text-[0.75rem] text-ink-muted">
          {sorted.length.toLocaleString("en-IN")} {sorted.length === 1 ? "row" : "rows"}
        </div>
      )}
    </div>
  );
}

export function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  onChange,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onChange: (p: number) => void;
}) {
  const from = page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);

  // Windowed page numbers — 124 pages must not render 124 buttons.
  const nums: (number | "…")[] = [];
  const push = (n: number | "…") => nums.push(n);
  if (pageCount <= 7) for (let i = 0; i < pageCount; i++) push(i);
  else {
    push(0);
    if (page > 2) push("…");
    for (let i = Math.max(1, page - 1); i <= Math.min(pageCount - 2, page + 1); i++) push(i);
    if (page < pageCount - 3) push("…");
    push(pageCount - 1);
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline px-[var(--cell-px)] py-2.5">
      <span className="tnum text-[0.75rem] text-ink-muted">
        {from.toLocaleString("en-IN")}–{to.toLocaleString("en-IN")} of{" "}
        {total.toLocaleString("en-IN")}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(Math.max(0, page - 1))}
          disabled={page === 0}
          aria-label="Previous page"
          className="grid size-7 place-items-center rounded-neo-sm text-ink-muted transition-colors hover:bg-base hover:text-ink disabled:opacity-30"
        >
          <ChevronLeft className="size-4" />
        </button>
        {nums.map((n, i) =>
          n === "…" ? (
            <span key={`e${i}`} className="px-1 text-[0.75rem] text-ink-faint">
              …
            </span>
          ) : (
            <button
              key={n}
              onClick={() => onChange(n)}
              aria-current={n === page ? "page" : undefined}
              className={cn(
                "tnum grid size-7 place-items-center rounded-neo-sm text-[0.75rem] font-medium transition-all",
                n === page
                  ? "neo-pressed text-ink"
                  : "text-ink-muted hover:bg-base hover:text-ink",
              )}
            >
              {n + 1}
            </button>
          ),
        )}
        <button
          onClick={() => onChange(Math.min(pageCount - 1, page + 1))}
          disabled={page >= pageCount - 1}
          aria-label="Next page"
          className="grid size-7 place-items-center rounded-neo-sm text-ink-muted transition-colors hover:bg-base hover:text-ink disabled:opacity-30"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}
