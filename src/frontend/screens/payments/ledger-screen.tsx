"use client";

import { useRouter } from "next/navigation";

import { useMemo, useState } from "react";
import { Download, ShieldAlert, Wallet, TrendingUp, Clock, Receipt } from "lucide-react";
import { Page, PageHeader, StatGrid } from "@/frontend/components/page";
import { PaymentsNav } from "./payments-nav";
import {
  NeoCard,
  NeoButton,
  DataTable,
  StatusBadge,
  NeoStatTile,
  EmptyState,
  toast,
  type Column,
  type SortState,
} from "@/frontend/components/neo";
import { FilterBar, type Facet } from "@/frontend/components/filter-bar";
import { PaymentDrawer } from "./payment-drawer";
import { AreaChart, DonutChart, Sparkline } from "@/frontend/components/charts";
import { useAsync, useDebounced } from "@/frontend/hooks/use-async";
import { useLookups } from "@/frontend/hooks/use-lookups";
import { getRepo } from "@/lib/data";
import type { Payment } from "@/lib/data/types";
import { PAYMENT_METHODS, inr } from "@/lib/fest.config";
import { PAYMENT_LABEL, PAYMENT_TONE, slaLabel, slaTone } from "@/frontend/status";
import { downloadCsv, hoursSince, relativeTime } from "@/lib/utils";

export function LedgerScreen() {
  const router = useRouter();
  const lookups = useLookups();
  const [search, setSearch] = useState("");
  const dSearch = useDebounced(search, 220);
  const [facetState, setFacetState] = useState<Record<string, string[]>>({});
  const [sort, setSort] = useState<SortState>({ key: "submittedAt", dir: "desc" });
  const [openId, setOpenId] = useState<string | null>(null);

  const filter = useMemo(
    () => ({
      search: dSearch || undefined,
      status: facetState.status?.length ? facetState.status : undefined,
      method: facetState.method?.length ? facetState.method : undefined,
      flaggedOnly: facetState.flags?.includes("flagged") || undefined,
    }),
    [dSearch, facetState],
  );

  const rows = useAsync(() => getRepo().payments.list(filter), [filter]);
  const all = useAsync(() => getRepo().payments.list(), []);
  const stats = useAsync(() => getRepo().overview.stats(), []);

  const totals = useMemo(() => {
    const data = all.data ?? [];
    const verified = data.filter((p) => p.status === "verified");
    const pending = data.filter((p) => p.status === "pending");
    return {
      collected: verified.reduce((s, p) => s + p.amount, 0),
      pendingValue: pending.reduce((s, p) => s + p.amount, 0),
      pendingCount: pending.length,
      flagged: data.filter((p) => p.fraudFlags.length > 0).length,
      avgTicket: verified.length ? verified.reduce((s, p) => s + p.amount, 0) / verified.length : 0,
    };
  }, [all.data]);

  const facets: Facet[] = [
    {
      key: "status",
      label: "Status",
      selected: facetState.status ?? [],
      options: ["pending", "verified", "rejected", "refunded"].map((s) => ({
        value: s,
        label: PAYMENT_LABEL[s],
        count: (all.data ?? []).filter((p) => p.status === s).length,
      })),
    },
    {
      key: "method",
      label: "Method",
      selected: facetState.method ?? [],
      options: PAYMENT_METHODS.map((m) => ({
        value: m.id,
        label: m.label,
        count: (all.data ?? []).filter((p) => p.method === m.id).length,
      })),
    },
    {
      key: "flags",
      label: "Fraud",
      selected: facetState.flags ?? [],
      options: [{ value: "flagged", label: "Flagged only", count: totals.flagged }],
    },
  ];

  const columns: Column<Payment>[] = [
    {
      key: "participant",
      header: "Participant",
      sortValue: (p) => lookups.participant(p.participantId)?.fullName ?? "",
      cell: (p) => {
        const who = lookups.participant(p.participantId);
        return (
          <div className="min-w-0">
            <div className="truncate font-medium text-ink">{who?.fullName ?? "Unknown"}</div>
            <div className="truncate font-mono text-[0.72rem] text-ink-muted">
              {who?.code} · {lookups.collegeOf(p.participantId)?.shortName ?? "—"}
            </div>
          </div>
        );
      },
    },
    {
      key: "amount",
      header: "Amount",
      width: "104px",
      align: "right",
      sortValue: (p) => p.amount,
      cell: (p) => (
        <span className="tnum font-semibold text-ink">{inr(p.amount)}</span>
      ),
    },
    {
      key: "method",
      header: "Method",
      width: "104px",
      sortValue: (p) => p.method ?? "",
      cell: (p) => (
        <span className="text-[0.78rem] text-ink-soft">
          {PAYMENT_METHODS.find((m) => m.id === p.method)?.label ?? p.method}
        </span>
      ),
    },
    {
      key: "utr",
      header: "UTR / Ref",
      width: "144px",
      hideBelow: "md",
      sortValue: (p) => p.utr ?? "",
      cell: (p) =>
        p.utr ? (
          <span className="font-mono text-[0.74rem] tracking-tight text-ink-muted">{p.utr}</span>
        ) : (
          <span className="text-[0.74rem] text-ink-faint">cash</span>
        ),
    },
    {
      key: "status",
      header: "Status",
      width: "134px",
      sortValue: (p) => p.status,
      cell: (p) => (
        <div className="flex items-center gap-1.5">
          <StatusBadge tone={PAYMENT_TONE[p.status]} size="sm">
            {PAYMENT_LABEL[p.status]}
          </StatusBadge>
          {p.fraudFlags.length ? (
            <ShieldAlert className="size-3.5 shrink-0 text-failed" aria-label="Flagged" />
          ) : null}
        </div>
      ),
    },
    {
      key: "invoice",
      header: "Invoice",
      width: "140px",
      optional: true,
      sortValue: (p) => p.invoiceSerial ?? "",
      cell: (p) => (
        <span className="font-mono text-[0.72rem] text-ink-muted">{p.invoiceSerial ?? "—"}</span>
      ),
    },
    {
      key: "submittedAt",
      header: "Submitted",
      width: "104px",
      hideBelow: "lg",
      sortValue: (p) => p.submittedAt,
      cell: (p) => (
        <span className="text-[0.76rem] text-ink-muted">{relativeTime(p.submittedAt)}</span>
      ),
    },
    {
      key: "age",
      header: "Age",
      width: "70px",
      align: "right",
      sortValue: (p) => (p.status === "pending" ? hoursSince(p.submittedAt) : -1),
      cell: (p) =>
        p.status === "pending" ? (
          <StatusBadge tone={slaTone(hoursSince(p.submittedAt))} size="sm" dot={false}>
            {slaLabel(hoursSince(p.submittedAt))}
          </StatusBadge>
        ) : (
          <span className="text-ink-faint">—</span>
        ),
    },
  ];

  const exportCsv = () => {
    const data = rows.data ?? [];
    downloadCsv(`payment-ledger-${new Date().toISOString().slice(0, 10)}.csv`, [
      ["Payment ID", "Invoice", "Participant", "Code", "College", "Amount", "Method", "UTR", "Status", "Submitted", "Reviewed by", "Flags"],
      ...data.map((p) => {
        const who = lookups.participant(p.participantId);
        return [
          p.id,
          p.invoiceSerial ?? "",
          who?.fullName ?? "",
          who?.code ?? "",
          lookups.collegeOf(p.participantId)?.name ?? "",
          p.amount,
          p.method,
          p.utr ?? "",
          p.status,
          p.submittedAt,
          lookups.staffMember(p.reviewedBy)?.name ?? "",
          p.fraudFlags.map((f) => f.kind).join("; "),
        ];
      }),
    ]);
    toast.success(`Exported ${data.length.toLocaleString("en-IN")} transactions`);
  };

  const s = stats.data;

  return (
    <Page>
      <PageHeader
        title="Payment ledger"
        description="Every transaction across the fest, whatever rail it came in on. Click a row to see the receipt, the fee breakdown and the audit trail."
        actions={
          <NeoButton size="sm" variant="secondary" icon={<Download />} onClick={exportCsv}>
            Export ledger
          </NeoButton>
        }
      />

      <PaymentsNav />

      <StatGrid cols={4}>
        <NeoStatTile
          label="Collected"
          value={inr(totals.collected, { compact: true })}
          icon={<Wallet />}
          deltaLabel={`${(all.data ?? []).filter((p) => p.status === "verified").length} verified payments`}
          spark={
            s ? <Sparkline values={s.series.map((d) => d.revenue)} color="var(--viz-3)" /> : undefined
          }
        />
        <NeoStatTile
          label="Awaiting verification"
          value={inr(totals.pendingValue, { compact: true })}
          icon={<Clock />}
          deltaLabel={`${totals.pendingCount} payments in the queue`}
          onClick={() => router.push("/payments/queue")}
        />
        <NeoStatTile
          label="Flagged for review"
          value={totals.flagged.toLocaleString("en-IN")}
          icon={<ShieldAlert />}
          deltaLabel="Reused UTR or duplicate receipt"
          onClick={() => router.push("/payments/fraud")}
        />
        <NeoStatTile
          label="Average payment"
          value={inr(Math.round(totals.avgTicket))}
          icon={<TrendingUp />}
          deltaLabel="Per verified transaction"
        />
      </StatGrid>

      {s ? (
        <div className="grid gap-4 xl:grid-cols-3">
          <NeoCard className="xl:col-span-2">
            <NeoCard.Header
              eyebrow="Last 30 days"
              title="Daily collections"
              subtitle="Verified payments only — pending money is not money yet."
            />
            <NeoCard.Raw>
              <AreaChart
                labels={s.series.map((d) => d.date.slice(5))}
                series={[
                  {
                    key: "rev",
                    label: "Collected",
                    slot: 2,
                    values: s.series.map((d) => d.revenue),
                  },
                ]}
                height={200}
                formatValue={(v) => inr(v)}
              />
            </NeoCard.Raw>
          </NeoCard>

          <NeoCard>
            <NeoCard.Header eyebrow="Rails" title="By method" subtitle="Where the money arrives." />
            <NeoCard.Raw>
              <DonutChart
                data={s.revenueByMethod
                  .filter((m) => m.amount > 0)
                  .map((m, i) => ({
                    label: PAYMENT_METHODS.find((p) => p.id === m.method)?.label ?? m.method,
                    value: m.amount,
                    slot: i,
                  }))}
                size={150}
                centerLabel="Total"
                centerValue={inr(totals.collected, { compact: true })}
                formatValue={(v) => inr(v, { compact: true })}
              />
            </NeoCard.Raw>
          </NeoCard>
        </div>
      ) : null}

      <FilterBar
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Name, UTR, invoice serial or participant code…"
        facets={facets}
        onFacetChange={(k, v) => setFacetState((st) => ({ ...st, [k]: v }))}
        onClearAll={() => {
          setFacetState({});
          setSearch("");
        }}
        resultCount={rows.data?.length}
        totalCount={all.data?.length}
      />

      <NeoCard>
        <NeoCard.Body flush>
          <DataTable
            rows={rows.data ?? []}
            columns={columns}
            rowKey={(p) => p.id}
            loading={rows.loading || lookups.loading}
            onRowClick={(p) => setOpenId(p.id)}
            sort={sort}
            onSortChange={setSort}
            pageSize={30}
            empty={
              <EmptyState
                icon={<Receipt />}
                title="No transactions match"
                hint="Clear a filter, or search by UTR."
              />
            }
          />
        </NeoCard.Body>
      </NeoCard>

      <PaymentDrawer
        paymentId={openId}
        onClose={() => setOpenId(null)}
        onChanged={() => {
          rows.reload();
          all.reload();
          stats.reload();
        }}
      />
    </Page>
  );
}
