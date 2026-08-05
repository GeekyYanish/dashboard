"use client";

import { useCallback, useEffect, useState } from "react";
import { Play, Check, X, AlertTriangle } from "lucide-react";
import { Page, PageHeader, StatGrid } from "@/frontend/components/page";
import { NeoCard, NeoButton, NeoStatTile, NeoSkeleton } from "@/frontend/components/neo";
import { SUITE, runSuite, type Result } from "./suite";
import { cn } from "@/lib/utils";

/**
 * The browser view of the assertion suite. The assertions themselves live in
 * ./suite.ts so the Node runner (`npm test`) executes exactly the same code.
 */

export function DataTestScreen() {
  const [results, setResults] = useState<Result[]>([]);
  const [running, setRunning] = useState(false);

  const run = useCallback(async () => {
    setRunning(true);
    setResults([]);
    const out = await runSuite((partial) => setResults(partial));
    setResults(out);
    setRunning(false);
  }, []);

  useEffect(() => {
    void run();
  }, [run]);

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  const groups = [...new Set(SUITE.map((s) => s.group))];

  return (
    <Page>
      <PageHeader
        title="Data layer test suite"
        description="Live assertions against the repository. The store is wiped and reseeded before every run, so results are deterministic. Dev-only — this route 404s in production."
        actions={
          <NeoButton variant="primary" icon={<Play />} loading={running} onClick={run}>
            Re-run suite
          </NeoButton>
        }
      />

      <StatGrid cols={4}>
        <NeoStatTile label="Assertions" value={`${results.length}/${SUITE.length}`} />
        <NeoStatTile label="Passed" value={passed} icon={<Check />} />
        <NeoStatTile label="Failed" value={failed} icon={<X />} />
        <NeoStatTile
          label="Duration"
          value={`${results.reduce((s, r) => s + r.ms, 0)}ms`}
        />
      </StatGrid>

      {failed > 0 ? (
        <div className="flex items-start gap-2.5 rounded-neo bg-failed-bg p-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-failed" />
          <p className="text-[0.83rem] leading-snug text-ink-soft">
            <span className="font-semibold text-ink">{failed} assertions failed.</span> Each one
            here corresponds to a way the registration desk loses money or trust — treat a red row
            as a real defect, not a flaky test.
          </p>
        </div>
      ) : results.length === SUITE.length ? (
        <div className="flex items-start gap-2.5 rounded-neo bg-paid-bg p-3">
          <Check className="mt-0.5 size-4 shrink-0 text-paid" />
          <p className="text-[0.83rem] text-ink-soft">
            <span className="font-semibold text-ink">All {passed} assertions pass.</span> Every
            invariant the console depends on holds.
          </p>
        </div>
      ) : null}

      {groups.map((g) => {
        const rows = results.filter((r) => r.group === g);
        if (!rows.length) return null;
        return (
          <NeoCard key={g}>
            <NeoCard.Header
              eyebrow={g}
              title={`${rows.filter((r) => r.ok).length}/${rows.length} passing`}
            />
            <NeoCard.Body flush>
              <ul className="divide-y divide-hairline">
                {rows.map((r) => (
                  <li key={r.name} className="flex items-start gap-3 px-4 py-2.5">
                    <span
                      className={cn(
                        "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full",
                        r.ok ? "bg-paid-bg text-paid" : "bg-failed-bg text-failed",
                      )}
                    >
                      {r.ok ? <Check className="size-3" strokeWidth={3} /> : <X className="size-3" strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[0.85rem] font-medium text-ink">{r.name}</span>
                      {!r.ok ? (
                        <span className="block text-[0.78rem] text-failed">{r.detail}</span>
                      ) : null}
                    </span>
                    <span className="tnum shrink-0 text-[0.72rem] text-ink-faint">{r.ms}ms</span>
                  </li>
                ))}
              </ul>
            </NeoCard.Body>
          </NeoCard>
        );
      })}

      {running && results.length < SUITE.length ? (
        <NeoSkeleton className="h-20 rounded-neo-lg" />
      ) : null}
    </Page>
  );
}
