"use client";

import { useRouter } from "next/navigation";

import Link from "next/link";
import { useMemo } from "react";
import {
  Users,
  Wallet,
  AlertTriangle,
  BedDouble,
  ScanLine,
  Building2,
  ClipboardList,
  ReceiptText,
  ArrowRight,
  FileWarning,
  ShieldAlert,
  CircleAlert,
} from "lucide-react";
import { Page, PageHeader, StatGrid } from "@/frontend/components/page";
import {
  NeoCard,
  NeoStatTile,
  NeoButton,
  StatusBadge,
  NeoSkeleton,
  LiveDot,
  NeoProgress,
  EmptyState,
  NeoAvatar,
} from "@/frontend/components/neo";
import { AreaChart, DonutChart, BarChart, Sparkline, Funnel, HeatmapGrid } from "@/frontend/components/charts";
import { useAsync } from "@/frontend/hooks/use-async";
import { getRepo } from "@/lib/data";
import { FEST, inr, PAYMENT_METHODS, TRACKS } from "@/lib/fest.config";
import { relativeTime, pct } from "@/lib/utils";
import { useDaysUntil } from "@/frontend/hooks/use-now";

export function OverviewScreen() {
  const router = useRouter();
  const daysToCloseValue = useDaysUntil(FEST.registrationClosesAt);
  const stats = useAsync(() => getRepo().overview.stats(), []);
  const attention = useAsync(() => getRepo().overview.attention(), []);
  const activity = useAsync(() => getRepo().overview.activity(12), []);
  const events = useAsync(() => getRepo().events.list(), []);
  const eventStats = useAsync(() => getRepo().events.allStats(), []);

  const s = stats.data;

  const sparks = useMemo(() => {
    if (!s) return { regs: [], revenue: [] };
    return {
      regs: s.series.map((d) => d.registrations),
      revenue: s.series.map((d) => d.revenue),
    };
  }, [s]);

  const heatCells = useMemo(() => {
    if (!events.data || !eventStats.data) return [];
    const byId = new Map(eventStats.data.map((e) => [e.eventId, e]));
    return events.data
      .filter((e) => e.status !== "cancelled" && e.capacity != null)
      .map((e) => {
        const st = byId.get(e.id);
        const filled = (st?.confirmedCount ?? 0) + (st?.pendingCount ?? 0);
        return {
          id: e.id,
          label: e.title,
          value: e.capacity ? Math.min(100, (filled / e.capacity) * 100) : 0,
          hint: `${filled} of ${e.capacity} seats · ${st?.waitlistCount ?? 0} waitlisted`,
        };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 24);
  }, [events.data, eventStats.data]);

  if (stats.loading || !s) return <OverviewSkeleton />;

  const collectedPct = s.revenueExpected ? (s.revenueCollected / s.revenueExpected) * 100 : 0;
  const daysToClose = daysToCloseValue;

  return (
    <Page>
      <PageHeader
        title="Command Center"
        description={`${FEST.fullName} · ${FEST.tagline}.${daysToClose != null ? ` Registration closes in ${daysToClose} days.` : ""}`}
        actions={
          <>
            <LiveDot label="Live" />
            <NeoButton
              variant="secondary"
              size="sm"
              icon={<ReceiptText />}
              onClick={() => router.push("/reports")}
            >
              Reports
            </NeoButton>
            <NeoButton
              variant="primary"
              size="sm"
              icon={<ScanLine />}
              onClick={() => router.push("/desk")}
            >
              Open desk
            </NeoButton>
          </>
        }
      />

      {/* ---- KPI row ------------------------------------------------------ */}
      <StatGrid cols={4}>
        <NeoStatTile
          label="Total registrations"
          value={s.totalRegistrations.toLocaleString("en-IN")}
          icon={<ClipboardList />}
          delta={12.4}
          deltaLabel={`${s.confirmed.toLocaleString("en-IN")} confirmed`}
          spark={<Sparkline values={sparks.regs} color="var(--viz-1)" />}
          onClick={() => router.push("/registrations")}
        />
        <NeoStatTile
          label="Revenue collected"
          value={inr(s.revenueCollected, { compact: true })}
          icon={<Wallet />}
          delta={8.1}
          deltaLabel={`${collectedPct.toFixed(0)}% of ${inr(s.revenueExpected, { compact: true })} expected`}
          spark={<Sparkline values={sparks.revenue} color="var(--viz-3)" />}
          onClick={() => router.push("/payments")}
        />
        <NeoStatTile
          label="Outstanding dues"
          value={inr(s.outstandingDues, { compact: true })}
          icon={<CircleAlert />}
          delta={-4.2}
          invertDelta
          deltaLabel="Across unpaid registrations"
          onClick={() => router.push("/payments/dues")}
        />
        <NeoStatTile
          label="Verification queue"
          value={s.verificationQueueDepth.toLocaleString("en-IN")}
          unit="pending"
          icon={<ReceiptText />}
          deltaLabel={
            s.oldestPendingHours > 24
              ? `Oldest ${Math.round(s.oldestPendingHours)}h — past SLA`
              : `Oldest ${Math.round(s.oldestPendingHours)}h`
          }
          onClick={() => router.push("/payments/queue")}
        />
      </StatGrid>

      <StatGrid cols={4}>
        <NeoStatTile
          label="Participants"
          value={s.participants.toLocaleString("en-IN")}
          icon={<Users />}
          deltaLabel={`${s.collegesOnboarded} colleges`}
          onClick={() => router.push("/participants")}
        />
        <NeoStatTile
          label="Accommodation"
          value={`${s.accommodationAllotted}/${s.accommodationRequested}`}
          icon={<BedDouble />}
          deltaLabel={`${pct(s.accommodationAllotted, s.accommodationCapacity)} of ${s.accommodationCapacity} beds`}
          onClick={() => router.push("/accommodation")}
        />
        <NeoStatTile
          label="Documents pending"
          value={s.docsPending.toLocaleString("en-IN")}
          icon={<FileWarning />}
          deltaLabel="Blocking badge issue"
          onClick={() => router.push("/documents")}
        />
        <NeoStatTile
          label="Checked in today"
          value={s.checkedInToday.toLocaleString("en-IN")}
          icon={<ScanLine />}
          deltaLabel={`${s.openTickets} open helpdesk tickets`}
          onClick={() => router.push("/checkin")}
        />
      </StatGrid>

      {/* ---- Needs attention ---------------------------------------------- */}
      {attention.data && attention.data.length > 0 ? (
        <NeoCard>
          <NeoCard.Header
            eyebrow="Triage"
            title="Needs attention"
            subtitle="Ranked by severity, then by how many records are affected."
            icon={<AlertTriangle />}
          />
          <NeoCard.Body flush>
            <ul className="divide-y divide-hairline">
              {attention.data.map((a) => (
                <li key={a.id}>
                  <Link
                    href={a.href}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-plane-alt"
                  >
                    <span
                      className={
                        a.severity === "critical"
                          ? "grid size-8 shrink-0 place-items-center rounded-neo-sm bg-failed-bg text-failed"
                          : "grid size-8 shrink-0 place-items-center rounded-neo-sm bg-pending-bg text-pending"
                      }
                    >
                      {a.kind === "fraud" ? (
                        <ShieldAlert className="size-4" />
                      ) : (
                        <AlertTriangle className="size-4" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.86rem] font-semibold text-ink">
                        {a.title}
                      </span>
                      <span className="block truncate text-[0.78rem] text-ink-muted">
                        {a.detail}
                      </span>
                    </span>
                    <StatusBadge tone={a.severity === "critical" ? "failed" : "pending"} size="sm">
                      {a.severity}
                    </StatusBadge>
                    <ArrowRight className="size-4 shrink-0 text-ink-faint" />
                  </Link>
                </li>
              ))}
            </ul>
          </NeoCard.Body>
        </NeoCard>
      ) : null}

      {/* ---- Trend + funnel ------------------------------------------------ */}
      <div className="grid gap-4 xl:grid-cols-3">
        <NeoCard className="xl:col-span-2">
          <NeoCard.Header
            eyebrow="Last 30 days"
            title="Registrations & revenue"
            subtitle="Daily registrations against verified collections."
            actions={
              <span className="engraved hidden sm:block">
                {s.series[0]?.date} → {s.series[s.series.length - 1]?.date}
              </span>
            }
          />
          <NeoCard.Raw>
            <AreaChart
              labels={s.series.map((d) => d.date.slice(5))}
              series={[
                { key: "regs", label: "Registrations", slot: 0, values: s.series.map((d) => d.registrations) },
                { key: "conf", label: "Confirmed", slot: 2, values: s.series.map((d) => d.confirmed) },
              ]}
              height={230}
            />
          </NeoCard.Raw>
        </NeoCard>

        <NeoCard>
          <NeoCard.Header
            eyebrow="Conversion"
            title="Registration funnel"
            subtitle="Where people drop out between signing up and turning up."
          />
          <NeoCard.Raw>
            <Funnel stages={s.funnel} />
          </NeoCard.Raw>
        </NeoCard>
      </div>

      {/* ---- Money + tracks ------------------------------------------------ */}
      <div className="grid gap-4 xl:grid-cols-3">
        <NeoCard>
          <NeoCard.Header
            eyebrow="Collections"
            title="Revenue by method"
            subtitle="Verified payments only."
          />
          <NeoCard.Raw>
            <DonutChart
              data={s.revenueByMethod
                .filter((m) => m.amount > 0)
                .map((m, i) => ({
                  label: PAYMENT_METHODS.find((p) => p.id === m.method)?.label ?? m.method,
                  value: m.amount,
                  slot: i,
                }))}
              centerLabel="Collected"
              centerValue={inr(s.revenueCollected, { compact: true })}
              formatValue={(v) => inr(v, { compact: true })}
            />
          </NeoCard.Raw>
        </NeoCard>

        <NeoCard>
          <NeoCard.Header
            eyebrow="Demand"
            title="Registrations by track"
            subtitle="Live registrations across the six tracks."
          />
          <NeoCard.Raw>
            <BarChart
              horizontal
              data={s.registrationsByTrack.map((t, i) => ({
                label: TRACKS.find((x) => x.id === t.track)?.label ?? t.track,
                value: t.count,
                slot: i,
              }))}
            />
          </NeoCard.Raw>
        </NeoCard>

        <NeoCard>
          <NeoCard.Header
            eyebrow="Contingents"
            title="Top colleges"
            subtitle="By headcount, with money still owed."
            icon={<Building2 />}
            actions={
              <Link href="/colleges" className="text-[0.75rem] font-semibold text-signal hover:underline">
                All
              </Link>
            }
          />
          <NeoCard.Body flush>
            <ul className="divide-y divide-hairline">
              {s.topColleges.slice(0, 8).map((c) => (
                <li key={c.collegeId} className="flex items-center gap-3 px-3.5 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.82rem] font-medium text-ink">
                      {c.name}
                    </span>
                    <span className="tnum block text-[0.72rem] text-ink-muted">
                      {c.count} people · {inr(c.paid, { compact: true })} paid
                    </span>
                  </span>
                  {c.due > 0 ? (
                    <StatusBadge tone="pending" size="sm" dot={false}>
                      {inr(c.due, { compact: true })} due
                    </StatusBadge>
                  ) : (
                    <StatusBadge tone="paid" size="sm" dot={false}>
                      Settled
                    </StatusBadge>
                  )}
                </li>
              ))}
            </ul>
          </NeoCard.Body>
        </NeoCard>
      </div>

      {/* ---- Capacity + activity ------------------------------------------- */}
      <div className="grid gap-4 xl:grid-cols-3">
        <NeoCard className="xl:col-span-2">
          <NeoCard.Header
            eyebrow="Capacity"
            title="Event fill rate"
            subtitle="Stronger colour means closer to full. Click any event to open its roster."
          />
          <NeoCard.Raw>
            {heatCells.length ? (
              <HeatmapGrid
                cells={heatCells}
                legendLow="Empty"
                legendHigh="At capacity"
                onCellClick={(id) => router.push(`/events?focus=${id}`)}
              />
            ) : (
              <NeoSkeleton className="h-40" />
            )}
          </NeoCard.Raw>
        </NeoCard>

        <NeoCard>
          <NeoCard.Header
            eyebrow="Audit"
            title="Recent activity"
            subtitle="Every mutation, newest first."
            actions={
              <Link href="/audit" className="text-[0.75rem] font-semibold text-signal hover:underline">
                Full log
              </Link>
            }
          />
          <NeoCard.Body flush>
            {activity.data?.length ? (
              <ul className="divide-y divide-hairline">
                {activity.data.map((a) => (
                  <li key={a.id} className="flex items-start gap-2.5 px-3.5 py-2.5">
                    <NeoAvatar name={a.actorName} size={26} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[0.78rem] leading-snug text-ink-soft">
                        <span className="font-semibold text-ink">{a.actorName}</span>{" "}
                        <span className="font-mono text-[0.72rem] text-ink-muted">{a.action}</span>
                      </span>
                      <span className="block text-[0.7rem] text-ink-faint">
                        {relativeTime(a.at)}
                        {a.note ? ` · ${a.note}` : ""}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No activity yet" />
            )}
          </NeoCard.Body>
        </NeoCard>
      </div>

      {/* ---- Collection progress ------------------------------------------- */}
      <NeoCard>
        <NeoCard.Header
          eyebrow="Finance"
          title="Collection progress"
          subtitle="Verified collections against what every live registration should bring in."
        />
        <NeoCard.Raw className="space-y-4">
          <NeoProgress
            value={s.revenueCollected}
            max={s.revenueExpected}
            tone="paid"
            label={`${inr(s.revenueCollected)} of ${inr(s.revenueExpected)}`}
            showValue
          />
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { label: "Collected", value: s.revenueCollected, tone: "paid" as const },
              { label: "Outstanding", value: s.outstandingDues, tone: "pending" as const },
              {
                label: "In verification",
                value: s.verificationQueueDepth,
                tone: "waitlist" as const,
                isCount: true,
              },
            ].map((b) => (
              <div key={b.label} className="neo-inset-sm rounded-neo p-3">
                <div className="engraved mb-1.5">{b.label}</div>
                <div className="tnum font-display text-[1.25rem] font-semibold text-ink">
                  {b.isCount ? b.value.toLocaleString("en-IN") : inr(b.value)}
                </div>
              </div>
            ))}
          </div>
        </NeoCard.Raw>
      </NeoCard>
    </Page>
  );
}

function OverviewSkeleton() {
  return (
    <Page>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <NeoSkeleton key={i} className="h-36 rounded-neo-lg" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <NeoSkeleton className="h-80 rounded-neo-lg xl:col-span-2" />
        <NeoSkeleton className="h-80 rounded-neo-lg" />
      </div>
    </Page>
  );
}
