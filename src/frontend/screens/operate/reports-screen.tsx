"use client";

import { useMemo, useState } from "react";
import { BarChart3, Download, Printer, FileText } from "lucide-react";
import { Page, PageHeader, StatGrid } from "@/frontend/components/page";
import {
  NeoCard,
  NeoButton,
  NeoStatTile,
  DataTable,
  NeoSkeleton,
  toast,
  type Column,
} from "@/frontend/components/neo";
import { AreaChart, BarChart, DonutChart, StackedBar, Funnel } from "@/frontend/components/charts";
import { useAsync } from "@/frontend/hooks/use-async";
import { useLookups } from "@/frontend/hooks/use-lookups";
import { getRepo } from "@/lib/data";
import { FEST, PAYMENT_METHODS, TRACKS, inr } from "@/lib/fest.config";
import { downloadCsv } from "@/lib/utils";

type ReportId =
  | "summary"
  | "financial"
  | "college"
  | "event"
  | "accommodation"
  | "noshow"
  | "settlement";

const REPORTS: { id: ReportId; label: string; blurb: string }[] = [
  { id: "summary", label: "Registration summary", blurb: "Headline counts, funnel and daily trend." },
  { id: "financial", label: "Financial summary", blurb: "Collected, outstanding, method split, refunds." },
  { id: "college", label: "College-wise", blurb: "Contingent size, money and beds per institution." },
  { id: "event", label: "Event-wise", blurb: "Fill rate, waitlist and revenue per sub-event." },
  { id: "accommodation", label: "Accommodation", blurb: "Occupancy by block and check-in state." },
  { id: "noshow", label: "No-show analysis", blurb: "Confirmed but never checked in." },
  { id: "settlement", label: "Final settlement", blurb: "The end-of-fest reconciliation position." },
];

export function ReportsScreen() {
  const lookups = useLookups();
  const [report, setReport] = useState<ReportId>("summary");

  const stats = useAsync(() => getRepo().overview.stats(), []);
  const contingents = useAsync(() => getRepo().colleges.contingents(), []);
  const eventStats = useAsync(() => getRepo().events.allStats(), []);
  const occupancy = useAsync(() => getRepo().accommodation.occupancy(), []);
  const refunds = useAsync(() => getRepo().refunds.list(), []);
  const unmatched = useAsync(() => getRepo().settlements.unmatched(), []);
  const payments = useAsync(() => getRepo().payments.list(), []);

  const s = stats.data;

  const settlement = useMemo(() => {
    const verified = (payments.data ?? []).filter((p) => p.status === "verified");
    const gross = verified.reduce((sum, p) => sum + p.amount, 0);
    const refunded = (refunds.data ?? [])
      .filter((r) => r.status === "paid")
      .reduce((sum, r) => sum + r.amount, 0);
    const cash = verified.filter((p) => p.method === "cash").reduce((sum, p) => sum + p.amount, 0);
    return {
      gross,
      refunded,
      net: gross - refunded,
      cash,
      banked: gross - cash,
      unreconciled: (unmatched.data?.inApp ?? []).reduce((sum, p) => sum + p.amount, 0),
      unidentified: (unmatched.data?.inBank ?? []).reduce((sum, x) => sum + x.amount, 0),
    };
  }, [payments.data, refunds.data, unmatched.data]);

  const exportCurrent = () => {
    if (report === "college" && contingents.data) {
      downloadCsv("report-college-wise.csv", [
        ["College", "City", "State", "Participants", "Confirmed", "Paid", "Due", "Beds"],
        ...contingents.data.map((c) => [
          c.college.name, c.college.city, c.college.state,
          c.participants, c.confirmed, c.paid, c.due, c.accommodation,
        ]),
      ]);
    } else if (report === "event" && eventStats.data) {
      downloadCsv("report-event-wise.csv", [
        ["Event", "Track", "Capacity", "Confirmed", "Pending", "Waitlist", "Checked in", "Revenue"],
        ...eventStats.data.map((e) => {
          const ev = lookups.event(e.eventId);
          return [
            ev?.title ?? "", ev?.track ?? "", e.capacity ?? "",
            e.confirmedCount, e.pendingCount, e.waitlistCount, e.checkedInCount, e.revenue,
          ];
        }),
      ]);
    } else if (report === "financial" && s) {
      downloadCsv("report-financial.csv", [
        ["Metric", "Value"],
        ["Revenue collected", s.revenueCollected],
        ["Revenue expected", s.revenueExpected],
        ["Outstanding dues", s.outstandingDues],
        ["Refunds paid", settlement.refunded],
        ["Net position", settlement.net],
        [],
        ["Method", "Amount", "Count"],
        ...s.revenueByMethod.map((m) => [m.method, m.amount, m.count]),
      ]);
    } else if (report === "settlement") {
      downloadCsv("report-final-settlement.csv", [
        ["Line", "Amount"],
        ["Gross verified collections", settlement.gross],
        ["Less: refunds paid", -settlement.refunded],
        ["Net collections", settlement.net],
        ["  of which cash at desk", settlement.cash],
        ["  of which banked", settlement.banked],
        ["Unreconciled (in app, not in bank)", settlement.unreconciled],
        ["Unidentified (in bank, not in app)", settlement.unidentified],
      ]);
    } else if (s) {
      downloadCsv("report-registration-summary.csv", [
        ["Metric", "Value"],
        ["Total registrations", s.totalRegistrations],
        ["Confirmed", s.confirmed],
        ["Pending", s.pending],
        ["Waitlisted", s.waitlisted],
        ["Cancelled", s.cancelled],
        ["Participants", s.participants],
        ["Colleges", s.collegesOnboarded],
        [],
        ["Funnel stage", "Count"],
        ...s.funnel.map((f) => [f.stage, f.count]),
      ]);
    }
    toast.success("Report exported");
  };

  const current = REPORTS.find((r) => r.id === report)!;

  return (
    <Page>
      <PageHeader
        title="Reports"
        description="Prebuilt reports the registration team is actually asked for — by the treasurer, the principal, and the audit at the end."
        actions={
          <>
            <NeoButton size="sm" variant="secondary" icon={<Printer />} onClick={() => window.print()}>
              Print
            </NeoButton>
            <NeoButton size="sm" variant="primary" icon={<Download />} onClick={exportCurrent}>
              Export CSV
            </NeoButton>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <NeoCard className="h-fit" data-print-hide>
          <NeoCard.Header eyebrow="Library" title="Reports" icon={<FileText />} />
          <NeoCard.Body flush>
            <ul className="divide-y divide-hairline">
              {REPORTS.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => setReport(r.id)}
                    className={`w-full px-3.5 py-2.5 text-left transition-colors ${
                      report === r.id ? "bg-signal-soft/50" : "hover:bg-plane-alt"
                    }`}
                  >
                    <span className="block text-[0.83rem] font-medium text-ink">{r.label}</span>
                    <span className="block text-[0.72rem] leading-snug text-ink-muted">
                      {r.blurb}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </NeoCard.Body>
        </NeoCard>

        <div className="space-y-4">
          <NeoCard>
            <NeoCard.Header
              eyebrow={`${FEST.fullName} · as of today`}
              title={current.label}
              subtitle={current.blurb}
              icon={<BarChart3 />}
            />
          </NeoCard>

          {!s ? (
            <NeoSkeleton className="h-80 rounded-neo-lg" />
          ) : report === "summary" ? (
            <>
              <StatGrid cols={4}>
                <NeoStatTile label="Registrations" value={s.totalRegistrations.toLocaleString("en-IN")} />
                <NeoStatTile label="Confirmed" value={s.confirmed.toLocaleString("en-IN")} />
                <NeoStatTile label="Participants" value={s.participants.toLocaleString("en-IN")} />
                <NeoStatTile label="Colleges" value={s.collegesOnboarded} />
              </StatGrid>
              <NeoCard>
                <NeoCard.Header title="Daily registrations" />
                <NeoCard.Raw>
                  <AreaChart
                    labels={s.series.map((d) => d.date.slice(5))}
                    series={[
                      { key: "r", label: "Registrations", slot: 0, values: s.series.map((d) => d.registrations) },
                      { key: "c", label: "Confirmed", slot: 2, values: s.series.map((d) => d.confirmed) },
                    ]}
                  />
                </NeoCard.Raw>
              </NeoCard>
              <NeoCard>
                <NeoCard.Header title="Funnel" subtitle="Drop-off between each stage." />
                <NeoCard.Raw>
                  <Funnel stages={s.funnel} />
                </NeoCard.Raw>
              </NeoCard>
            </>
          ) : report === "financial" ? (
            <>
              <StatGrid cols={4}>
                <NeoStatTile label="Collected" value={inr(s.revenueCollected, { compact: true })} />
                <NeoStatTile label="Expected" value={inr(s.revenueExpected, { compact: true })} />
                <NeoStatTile label="Outstanding" value={inr(s.outstandingDues, { compact: true })} />
                <NeoStatTile label="Refunded" value={inr(settlement.refunded, { compact: true })} />
              </StatGrid>
              <div className="grid gap-4 xl:grid-cols-2">
                <NeoCard>
                  <NeoCard.Header title="By method" />
                  <NeoCard.Raw>
                    <DonutChart
                      data={s.revenueByMethod
                        .filter((m) => m.amount > 0)
                        .map((m, i) => ({
                          label: PAYMENT_METHODS.find((p) => p.id === m.method)?.label ?? m.method,
                          value: m.amount,
                          slot: i,
                        }))}
                      formatValue={(v) => inr(v, { compact: true })}
                    />
                  </NeoCard.Raw>
                </NeoCard>
                <NeoCard>
                  <NeoCard.Header title="Daily collections" />
                  <NeoCard.Raw>
                    <AreaChart
                      labels={s.series.map((d) => d.date.slice(5))}
                      series={[{ key: "rev", label: "Collected", slot: 2, values: s.series.map((d) => d.revenue) }]}
                      formatValue={(v) => inr(v)}
                    />
                  </NeoCard.Raw>
                </NeoCard>
              </div>
            </>
          ) : report === "college" ? (
            <NeoCard>
              <NeoCard.Body flush>
                <DataTable
                  rows={contingents.data ?? []}
                  columns={
                    [
                      {
                        key: "name",
                        header: "College",
                        sortValue: (c) => c.college.name,
                        cell: (c) => <span className="font-medium text-ink">{c.college.name}</span>,
                      },
                      {
                        key: "people",
                        header: "People",
                        width: "80px",
                        align: "right",
                        sortValue: (c) => c.participants,
                        cell: (c) => <span className="tnum">{c.participants}</span>,
                      },
                      {
                        key: "confirmed",
                        header: "Confirmed",
                        width: "94px",
                        align: "right",
                        sortValue: (c) => c.confirmed,
                        cell: (c) => <span className="tnum">{c.confirmed}</span>,
                      },
                      {
                        key: "paid",
                        header: "Paid",
                        width: "104px",
                        align: "right",
                        sortValue: (c) => c.paid,
                        cell: (c) => <span className="tnum text-paid">{inr(c.paid)}</span>,
                      },
                      {
                        key: "due",
                        header: "Due",
                        width: "104px",
                        align: "right",
                        sortValue: (c) => c.due,
                        cell: (c) => <span className="tnum text-failed">{inr(c.due)}</span>,
                      },
                      {
                        key: "beds",
                        header: "Beds",
                        width: "72px",
                        align: "right",
                        sortValue: (c) => c.accommodation,
                        cell: (c) => <span className="tnum">{c.accommodation}</span>,
                      },
                    ] as Column<NonNullable<typeof contingents.data>[number]>[]
                  }
                  rowKey={(c) => c.college.id}
                  loading={contingents.loading}
                  sort={{ key: "people", dir: "desc" }}
                  pageSize={40}
                />
              </NeoCard.Body>
            </NeoCard>
          ) : report === "event" ? (
            <NeoCard>
              <NeoCard.Body flush>
                <DataTable
                  rows={eventStats.data ?? []}
                  columns={
                    [
                      {
                        key: "title",
                        header: "Event",
                        sortValue: (e) => lookups.event(e.eventId)?.title ?? "",
                        cell: (e) => (
                          <div className="min-w-0">
                            <div className="truncate font-medium text-ink">
                              {lookups.event(e.eventId)?.title}
                            </div>
                            <div className="text-[0.72rem] text-ink-muted">
                              {TRACKS.find((t) => t.id === lookups.event(e.eventId)?.track)?.label}
                            </div>
                          </div>
                        ),
                      },
                      {
                        key: "cap",
                        header: "Capacity",
                        width: "88px",
                        align: "right",
                        sortValue: (e) => e.capacity ?? 0,
                        cell: (e) => <span className="tnum">{e.capacity ?? "∞"}</span>,
                      },
                      {
                        key: "conf",
                        header: "Confirmed",
                        width: "94px",
                        align: "right",
                        sortValue: (e) => e.confirmedCount,
                        cell: (e) => <span className="tnum">{e.confirmedCount}</span>,
                      },
                      {
                        key: "wl",
                        header: "Waitlist",
                        width: "84px",
                        align: "right",
                        sortValue: (e) => e.waitlistCount,
                        cell: (e) => <span className="tnum">{e.waitlistCount}</span>,
                      },
                      {
                        key: "in",
                        header: "Checked in",
                        width: "98px",
                        align: "right",
                        sortValue: (e) => e.checkedInCount,
                        cell: (e) => <span className="tnum">{e.checkedInCount}</span>,
                      },
                      {
                        key: "rev",
                        header: "Revenue",
                        width: "110px",
                        align: "right",
                        sortValue: (e) => e.revenue,
                        cell: (e) => <span className="tnum text-ink">{inr(e.revenue)}</span>,
                      },
                    ] as Column<NonNullable<typeof eventStats.data>[number]>[]
                  }
                  rowKey={(e) => e.eventId}
                  loading={eventStats.loading}
                  sort={{ key: "rev", dir: "desc" }}
                  pageSize={40}
                />
              </NeoCard.Body>
            </NeoCard>
          ) : report === "accommodation" ? (
            <NeoCard>
              <NeoCard.Header title="Occupancy by block" />
              <NeoCard.Raw>
                <StackedBar
                  rows={(occupancy.data ?? []).map((b) => ({
                    label: b.name,
                    values: { occupied: b.occupied, free: b.capacity - b.occupied },
                  }))}
                  keys={[
                    { key: "occupied", label: "Occupied", slot: 0 },
                    { key: "free", label: "Free", slot: 3 },
                  ]}
                />
              </NeoCard.Raw>
            </NeoCard>
          ) : report === "noshow" ? (
            <NeoCard>
              <NeoCard.Header
                title="No-show rate by event"
                subtitle="Confirmed registrations with no attendance record."
              />
              <NeoCard.Raw>
                <BarChart
                  horizontal
                  data={(eventStats.data ?? [])
                    .filter((e) => e.confirmedCount > 0)
                    .map((e) => ({
                      label: lookups.event(e.eventId)?.title ?? e.eventId,
                      value: Math.max(0, e.confirmedCount - e.checkedInCount),
                      slot: 7,
                    }))
                    .sort((a, b) => b.value - a.value)
                    .slice(0, 15)}
                />
              </NeoCard.Raw>
            </NeoCard>
          ) : (
            <NeoCard>
              <NeoCard.Header
                title="Final settlement position"
                subtitle="What was collected, what went back out, and what is still unaccounted for."
              />
              <NeoCard.Body>
                <dl className="space-y-2">
                  {[
                    ["Gross verified collections", settlement.gross, "ink"],
                    ["Less: refunds paid", -settlement.refunded, "failed"],
                    ["Net collections", settlement.net, "paid"],
                    ["  of which cash at desk", settlement.cash, "muted"],
                    ["  of which banked", settlement.banked, "muted"],
                    ["Unreconciled (in app, not in bank)", settlement.unreconciled, "pending"],
                    ["Unidentified (in bank, not in app)", settlement.unidentified, "pending"],
                  ].map(([label, value, tone]) => (
                    <div
                      key={String(label)}
                      className={`flex items-baseline justify-between gap-4 border-b border-hairline pb-2 ${
                        label === "Net collections" ? "border-ink/20 pt-1 font-semibold" : ""
                      }`}
                    >
                      <dt
                        className={`text-[0.85rem] ${
                          tone === "muted" ? "pl-4 text-ink-muted" : "text-ink-soft"
                        }`}
                      >
                        {String(label)}
                      </dt>
                      <dd
                        className={`tnum text-[0.9rem] font-semibold ${
                          tone === "failed"
                            ? "text-failed"
                            : tone === "paid"
                              ? "text-paid"
                              : tone === "pending"
                                ? "text-pending"
                                : tone === "muted"
                                  ? "text-ink-muted"
                                  : "text-ink"
                        }`}
                      >
                        {inr(Number(value))}
                      </dd>
                    </div>
                  ))}
                </dl>
                {settlement.unreconciled > 0 || settlement.unidentified > 0 ? (
                  <p className="mt-4 rounded-neo bg-pending-bg p-3 text-[0.8rem] leading-snug text-ink-soft">
                    <span className="font-semibold text-ink">Not closeable yet.</span> Clear the two
                    reconciliation worklists before signing this off — otherwise the difference gets
                    written off as a loss.
                  </p>
                ) : null}
              </NeoCard.Body>
            </NeoCard>
          )}
        </div>
      </div>
    </Page>
  );
}
