"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Search, CornerDownLeft, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { ALL_NAV_ITEMS } from "@/frontend/nav";
import { getRepo } from "@/lib/data";
import type { Participant } from "@/lib/data/types";
import { Kbd } from "@/frontend/components/neo";
import { useDebounced } from "@/frontend/hooks/use-async";

/**
 * ⌘K. Two kinds of result, because the operator wants two different things:
 * a route ("take me to refunds") and a person ("find Aditya's payment"). The
 * person lookup hits the same fuzzy search the desk kiosk uses.
 */

interface Result {
  id: string;
  kind: "route" | "person" | "action";
  label: string;
  hint?: string;
  section: string;
  run: () => void;
}

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 140);
  const [people, setPeople] = useState<Participant[]>([]);
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setQ("");
      setCursor(0);
    }
  }, [open]);

  useEffect(() => {
    let cancelled = false;
    if (dq.trim().length < 2) {
      setPeople([]);
      return;
    }
    getRepo()
      .participants.search(dq, 6)
      .then((r) => {
        if (!cancelled) setPeople(r);
      })
      .catch(() => setPeople([]));
    return () => {
      cancelled = true;
    };
  }, [dq]);

  const results = useMemo<Result[]>(() => {
    const needle = q.trim().toLowerCase();
    const routes: Result[] = ALL_NAV_ITEMS.filter(
      (i) => !needle || i.label.toLowerCase().includes(needle) || i.section.toLowerCase().includes(needle),
    ).map((i) => ({
      id: `route-${i.href}`,
      kind: "route",
      label: i.label,
      section: i.section,
      run: () => {
        router.push(i.href);
        onOpenChange(false);
      },
    }));

    const persons: Result[] = people.map((p) => ({
      id: `person-${p.id}`,
      kind: "person",
      label: p.fullName,
      hint: `${p.code} · ${p.phone}`,
      section: "Participants",
      run: () => {
        router.push(`/participants?focus=${p.id}`);
        onOpenChange(false);
      },
    }));

    const actions: Result[] = (
      [
        ["Verify payments", "/payments/queue"],
        ["Record a walk-in", "/desk"],
        ["Import registrations from CSV", "/registrations/import"],
        ["Reconcile bank statement", "/payments/settlements"],
        ["Allot accommodation", "/accommodation"],
        ["Send a broadcast", "/communications"],
        ["Open the war room", "/live"],
      ] as const
    )
      .filter(([label]) => !needle || label.toLowerCase().includes(needle))
      .map(([label, href]) => ({
        id: `action-${href}-${label}`,
        kind: "action" as const,
        label,
        section: "Actions",
        run: () => {
          router.push(href);
          onOpenChange(false);
        },
      }));

    return [...persons, ...routes, ...actions].slice(0, 24);
  }, [q, people, router, onOpenChange]);

  useEffect(() => setCursor(0), [results.length]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(results.length - 1, c + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      results[cursor]?.run();
    }
  };

  useEffect(() => {
    listRef.current
      ?.querySelector('[data-cursor="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  let lastSection = "";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-50 backdrop-blur-[2px]"
          style={{ background: "var(--neo-scrim)" }}
        />
        <Dialog.Content
          onKeyDown={onKeyDown}
          className="neo-float fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-neo-lg border border-hairline data-[state=open]:animate-[neo-rise_0.2s_cubic-bezier(0.22,1,0.36,1)]"
        >
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <Dialog.Description className="sr-only">
            Search participants, jump to a page, or run an action.
          </Dialog.Description>

          <div className="flex items-center gap-3 border-b border-engrave px-4">
            <Search className="size-4 shrink-0 text-ink-faint" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search people, pages and actions…"
              className="h-14 w-full bg-transparent text-[0.95rem] text-ink outline-none placeholder:text-ink-faint"
            />
            <Kbd>ESC</Kbd>
          </div>

          <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-2">
            {results.length === 0 ? (
              <p className="px-3 py-8 text-center text-[0.85rem] text-ink-muted">
                Nothing matches “{q}”.
              </p>
            ) : (
              results.map((r, i) => {
                const showHeader = r.section !== lastSection;
                lastSection = r.section;
                return (
                  <div key={r.id}>
                    {showHeader ? <div className="engraved px-3 pb-1 pt-3">{r.section}</div> : null}
                    <button
                      data-cursor={i === cursor}
                      onMouseEnter={() => setCursor(i)}
                      onClick={r.run}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-neo px-3 py-2.5 text-left transition-colors",
                        i === cursor ? "bg-plane text-ink" : "text-ink-soft",
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.86rem] font-medium">{r.label}</span>
                        {r.hint ? (
                          <span className="block truncate font-mono text-[0.72rem] text-ink-muted">
                            {r.hint}
                          </span>
                        ) : null}
                      </span>
                      {i === cursor ? (
                        <CornerDownLeft className="size-3.5 shrink-0 text-ink-faint" />
                      ) : null}
                    </button>
                  </div>
                );
              })
            )}
          </div>

          <div className="flex items-center gap-4 border-t border-engrave px-4 py-2.5 text-[0.7rem] text-ink-muted">
            <span className="inline-flex items-center gap-1.5">
              <ArrowUp className="size-3" />
              <ArrowDown className="size-3" />
              navigate
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CornerDownLeft className="size-3" />
              open
            </span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
