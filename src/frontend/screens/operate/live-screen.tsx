"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, AlertTriangle, ShieldAlert } from "lucide-react";
import { LiveDot, NeoIconButton, StatusBadge, NeoProgress } from "@/frontend/components/neo";
import { Sparkline } from "@/frontend/components/charts";
import { useAsync } from "@/frontend/hooks/use-async";
import { getRepo } from "@/lib/data";
import { usePrefs } from "@/frontend/prefs";
import { useDaysUntil } from "@/frontend/hooks/use-now";
import { FEST, inr } from "@/lib/fest.config";
import { cn } from "@/lib/utils";

/**
 * THE WAR ROOM.
 *
 * A 1920-wide display bolted to the ops-room wall. Read from across a room, so
 * everything is oversized and there is no navigation at all. Dark by default —
 * a white wall-screen in a dim hall is unreadable and unpleasant for eight
 * hours straight.
 */
export function LiveScreen() {
  const { setTheme, theme } = usePrefs();
  const [tick, setTick] = useState(0);
  // Held in a ref, not state: the cleanup below runs with the mount-time
  // closure, so a state value set inside the same effect would still read as
  // null there and the operator's theme would never be restored.
  const restoreRef = useRef<"light" | "dark" | null>(null);

  const stats = useAsync(() => getRepo().overview.stats(), [tick]);
  const attention = useAsync(() => getRepo().overview.attention(), [tick]);
  const tokens = useAsync(() => getRepo().desk.tokens(), [tick]);
  const activity = useAsync(() => getRepo().overview.activity(8), [tick]);

  // Force dark for the wall display, and restore the operator's choice on exit.
  useEffect(() => {
    restoreRef.current = theme;
    setTheme("dark");
    return () => {
      if (restoreRef.current) setTheme(restoreRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-refresh. Nobody is going to walk over and hit reload.
  useEffect(() => {
    const id = setInterval(() => {
      void getRepo().admin.tick();
      setTick((t) => t + 1);
    }, 15000);
    return () => clearInterval(id);
  }, []);

  const s = stats.data;
  const waiting = (tokens.data ?? []).filter((t) => !t.servedAt).length;
  const critical = (attention.data ?? []).filter((a) => a.severity === "critical");

  const daysToFest = useDaysUntil(FEST.startsAt);

  return (
    <div className="min-h-dvh bg-canvas p-6 lg:p-10">
      <header className="mb-8 flex items-center gap-4">
        <Link href="/" data-print-hide>
          <NeoIconButton label="Back to console" size="sm" variant="ghost">
            <ArrowLeft />
          </NeoIconButton>
        </Link>
        <div className="min-w-0">
          <h1 className="font-display text-[2rem] font-bold leading-none tracking-tight text-ink lg:text-[2.6rem]">
            {FEST.name}
            <span className="text-signal">{FEST.edition}</span>
            <span className="ml-3 text-ink-muted">Registration</span>
          </h1>
          <p className="engraved mt-2">{FEST.tagline}</p>
        </div>
        <div className="ml-auto flex items-center gap-5">
          <LiveDot label="Auto-refreshing" />
          <div className="text-right">
            <div className="tnum font-display text-[2.2rem] font-bold leading-none text-ink">
              {daysToFest ?? "—"}
            </div>
            <div className="engraved mt-1">days to gates</div>
          </div>
        </div>
      </header>

      {critical.length ? (
        <div className="mb-6 space-y-2">
          {critical.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-4 rounded-neo-lg bg-failed-bg px-5 py-4"
            >
              <ShieldAlert className="size-7 shrink-0 text-failed" />
              <div className="min-w-0 flex-1">
                <p className="font-display text-[1.25rem] font-bold text-failed">{a.title}</p>
                <p className="text-[0.95rem] text-ink-soft">{a.detail}</p>
              </div>
              <span className="tnum font-display text-[2rem] font-bold text-failed">{a.count}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-4">
        <BigTile
          label="Registrations"
          value={s ? s.totalRegistrations.toLocaleString("en-IN") : "—"}
          sub={s ? `${s.confirmed.toLocaleString("en-IN")} confirmed` : ""}
          spark={s?.series.map((d) => d.registrations)}
        />
        <BigTile
          label="Collected"
          value={s ? inr(s.revenueCollected, { compact: true }) : "—"}
          sub={s ? `${inr(s.outstandingDues, { compact: true })} still owed` : ""}
          spark={s?.series.map((d) => d.revenue)}
          tone="paid"
        />
        <BigTile
          label="Verification queue"
          value={s ? String(s.verificationQueueDepth) : "—"}
          sub={s ? `oldest ${Math.round(s.oldestPendingHours)}h` : ""}
          tone={s && s.oldestPendingHours > 24 ? "failed" : "pending"}
        />
        <BigTile
          label="Desk queue"
          value={String(waiting)}
          sub={`${(tokens.data ?? []).filter((t) => t.servedAt).length} served`}
          tone={waiting > 12 ? "failed" : "info"}
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <div className="neo-raised rounded-neo-lg p-6 lg:col-span-2">
          <div className="engraved mb-4">Collection progress</div>
          {s ? (
            <>
              <div className="mb-4 flex items-end gap-3">
                <span className="tnum font-display text-[2.8rem] font-bold leading-none text-ink">
                  {inr(s.revenueCollected, { compact: true })}
                </span>
                <span className="mb-1.5 text-[1.1rem] text-ink-muted">
                  of {inr(s.revenueExpected, { compact: true })}
                </span>
              </div>
              <NeoProgress value={s.revenueCollected} max={s.revenueExpected} tone="paid" />
              <div className="mt-6 grid grid-cols-3 gap-4">
                <MiniLive label="Participants" value={s.participants.toLocaleString("en-IN")} />
                <MiniLive label="Colleges" value={String(s.collegesOnboarded)} />
                <MiniLive
                  label="Beds allotted"
                  value={`${s.accommodationAllotted}/${s.accommodationRequested}`}
                />
              </div>
            </>
          ) : null}
        </div>

        <div className="neo-raised rounded-neo-lg p-6">
          <div className="engraved mb-4">Latest activity</div>
          <ul className="space-y-3">
            {(activity.data ?? []).slice(0, 7).map((a) => (
              <li key={a.id} className="flex items-baseline gap-2.5">
                <span className="size-1.5 shrink-0 rounded-full bg-signal" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.95rem] text-ink-soft">
                    <span className="font-semibold text-ink">{a.actorName}</span>{" "}
                    <span className="font-mono text-[0.82rem] text-ink-muted">{a.action}</span>
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {(attention.data ?? []).filter((a) => a.severity !== "critical").length ? (
        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          {(attention.data ?? [])
            .filter((a) => a.severity !== "critical")
            .slice(0, 6)
            .map((a) => (
              <div key={a.id} className="neo-inset flex items-center gap-3 rounded-neo-lg p-4">
                <AlertTriangle className="size-5 shrink-0 text-pending" />
                <span className="min-w-0 flex-1 truncate text-[0.95rem] text-ink-soft">
                  {a.title}
                </span>
                <StatusBadge tone="pending" size="sm" dot={false}>
                  {a.count}
                </StatusBadge>
              </div>
            ))}
        </div>
      ) : null}
    </div>
  );
}

function BigTile({
  label,
  value,
  sub,
  spark,
  tone = "ink",
}: {
  label: string;
  value: string;
  sub?: string;
  spark?: number[];
  tone?: "ink" | "paid" | "pending" | "failed" | "info";
}) {
  const color = {
    ink: "text-ink",
    paid: "text-paid",
    pending: "text-pending",
    failed: "text-failed",
    info: "text-info",
  }[tone];
  const sparkColor = {
    ink: "var(--viz-1)",
    paid: "var(--viz-3)",
    pending: "var(--viz-4)",
    failed: "var(--viz-8)",
    info: "var(--viz-1)",
  }[tone];

  return (
    <div className="neo-raised rounded-neo-lg p-6">
      <div className="engraved mb-3">{label}</div>
      <div className={cn("tnum font-display text-[2.6rem] font-bold leading-none", color)}>
        {value}
      </div>
      {spark ? (
        <div className="-mx-1 mt-3 h-10">
          <Sparkline values={spark} color={sparkColor} height={40} />
        </div>
      ) : null}
      {sub ? <div className="mt-3 text-[0.95rem] text-ink-muted">{sub}</div> : null}
    </div>
  );
}

function MiniLive({ label, value }: { label: string; value: string }) {
  return (
    <div className="neo-inset-sm rounded-neo p-3">
      <div className="engraved mb-1.5 !text-[0.6rem]">{label}</div>
      <div className="tnum font-display text-[1.4rem] font-bold leading-none text-ink">{value}</div>
    </div>
  );
}
