"use client";

import { useMemo, useState } from "react";
import {
  Download,
  Send,
  Upload,
  Link2,
  Unlink,
  ShieldAlert,
  Banknote,
  CheckCheck,
  Wallet,
  ArrowRightLeft,
} from "lucide-react";
import { Page, PageHeader, StatGrid } from "@/frontend/components/page";
import { PaymentsNav } from "./payments-nav";
import {
  NeoCard,
  NeoButton,
  DataTable,
  StatusBadge,
  NeoStatTile,
  EmptyState,
  NeoSkeleton,
  NeoInput,
  NeoModal,
  KeyValue,
  NeoAvatar,
  NeoSegmented,
  toast,
  type Column,
} from "@/frontend/components/neo";
import { StackedBar } from "@/frontend/components/charts";
import { useAsync } from "@/frontend/hooks/use-async";
import { useLookups } from "@/frontend/hooks/use-lookups";
import { getRepo } from "@/lib/data";
import { isDataError, type Payment, type Refund, type Settlement } from "@/lib/data/types";
import { FEST, inr } from "@/lib/fest.config";
import { REFUND_TONE, titleCase } from "@/frontend/status";
import { downloadCsv, parseCsv, relativeTime } from "@/lib/utils";

/* ==========================================================================
   Outstanding dues — who owes what, bucketed by age.
   ========================================================================== */

export function DuesScreen() {
  const lookups = useLookups();
  const dues = useAsync(() => getRepo().payments.outstanding(), []);
  const [bucket, setBucket] = useState<"all" | "0-7" | "8-14" | "15+">("all");

  const rows = useMemo(() => {
    const d = dues.data ?? [];
    if (bucket === "all") return d;
    if (bucket === "0-7") return d.filter((x) => x.ageDays <= 7);
    if (bucket === "8-14") return d.filter((x) => x.ageDays > 7 && x.ageDays <= 14);
    return d.filter((x) => x.ageDays > 14);
  }, [dues.data, bucket]);

  const buckets = useMemo(() => {
    const d = dues.data ?? [];
    const b = (lo: number, hi: number) =>
      d.filter((x) => x.ageDays >= lo && x.ageDays <= hi).reduce((s, x) => s + x.due, 0);
    return [
      { label: "0–7 days", values: { due: b(0, 7) } },
      { label: "8–14 days", values: { due: b(8, 14) } },
      { label: "15–30 days", values: { due: b(15, 30) } },
      { label: "30+ days", values: { due: b(31, 9999) } },
    ];
  }, [dues.data]);

  const total = (dues.data ?? []).reduce((s, x) => s + x.due, 0);

  const columns: Column<(typeof rows)[number]>[] = [
    {
      key: "who",
      header: "Participant",
      sortValue: (r) => r.participant.fullName,
      cell: (r) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <NeoAvatar name={r.participant.fullName} size={28} />
          <div className="min-w-0">
            <div className="truncate font-medium text-ink">{r.participant.fullName}</div>
            <div className="truncate text-[0.72rem] text-ink-muted">
              {lookups.college(r.participant.collegeId)?.shortName} · {r.participant.phone}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: "regs",
      header: "Events",
      width: "72px",
      align: "right",
      sortValue: (r) => r.registrations,
      cell: (r) => <span className="tnum text-ink-muted">{r.registrations}</span>,
    },
    {
      key: "paid",
      header: "Paid",
      width: "100px",
      align: "right",
      sortValue: (r) => r.paid,
      cell: (r) => <span className="tnum text-paid">{inr(r.paid)}</span>,
    },
    {
      key: "due",
      header: "Due",
      width: "104px",
      align: "right",
      sortValue: (r) => r.due,
      cell: (r) => <span className="tnum font-semibold text-failed">{inr(r.due)}</span>,
    },
    {
      key: "age",
      header: "Age",
      width: "94px",
      align: "right",
      sortValue: (r) => r.ageDays,
      cell: (r) => (
        <StatusBadge
          size="sm"
          dot={false}
          tone={r.ageDays > 14 ? "failed" : r.ageDays > 7 ? "pending" : "neutral"}
        >
          {r.ageDays}d
        </StatusBadge>
      ),
    },
  ];

  return (
    <Page>
      <PageHeader
        title="Outstanding dues"
        description="Registrations that are live but unpaid. Partial payments count — the figure shown is what is still owed after everything verified."
        actions={
          <>
            <NeoButton
              size="sm"
              variant="secondary"
              icon={<Download />}
              onClick={() =>
                downloadCsv("outstanding-dues.csv", [
                  ["Name", "Code", "Phone", "College", "Events", "Paid", "Due", "Age (days)"],
                  ...rows.map((r) => [
                    r.participant.fullName,
                    r.participant.code,
                    r.participant.phone,
                    lookups.college(r.participant.collegeId)?.name ?? "",
                    r.registrations,
                    r.paid,
                    r.due,
                    r.ageDays,
                  ]),
                ])
              }
            >
              Export
            </NeoButton>
            <NeoButton
              size="sm"
              variant="primary"
              icon={<Send />}
              onClick={() =>
                toast.info(
                  "Audience staged",
                  `${rows.length} participants queued in Communications with the payment-reminder template.`,
                )
              }
            >
              Send reminders
            </NeoButton>
          </>
        }
      />
      <PaymentsNav />

      <StatGrid cols={4}>
        <NeoStatTile label="Total outstanding" value={inr(total, { compact: true })} icon={<Wallet />} />
        <NeoStatTile
          label="People owing"
          value={(dues.data?.length ?? 0).toLocaleString("en-IN")}
          icon={<Send />}
        />
        <NeoStatTile
          label="Over 14 days"
          value={(dues.data ?? []).filter((d) => d.ageDays > 14).length.toLocaleString("en-IN")}
          icon={<ShieldAlert />}
          deltaLabel="Least likely to convert"
        />
        <NeoStatTile
          label="Average owed"
          value={inr(dues.data?.length ? Math.round(total / dues.data.length) : 0)}
        />
      </StatGrid>

      <NeoCard>
        <NeoCard.Header eyebrow="Ageing" title="Dues by age" subtitle="Older debt converts worse." />
        <NeoCard.Raw>
          <StackedBar
            rows={buckets}
            keys={[{ key: "due", label: "Outstanding", slot: 7 }]}
            formatValue={(v) => inr(v, { compact: true })}
          />
        </NeoCard.Raw>
      </NeoCard>

      <div className="flex items-center gap-2">
        <NeoSegmented
          value={bucket}
          onChange={setBucket}
          options={[
            { value: "all", label: "All" },
            { value: "0-7", label: "0–7 days" },
            { value: "8-14", label: "8–14 days" },
            { value: "15+", label: "15+ days" },
          ]}
        />
      </div>

      <NeoCard>
        <NeoCard.Body flush>
          <DataTable
            rows={rows}
            columns={columns}
            rowKey={(r) => r.participant.id}
            loading={dues.loading}
            sort={{ key: "due", dir: "desc" }}
            pageSize={30}
            empty={<EmptyState title="Nothing outstanding" hint="Every live registration is paid up." />}
          />
        </NeoCard.Body>
      </NeoCard>
    </Page>
  );
}

/* ==========================================================================
   Refunds — request → approve → pay, with a hard cap at what was collected.
   ========================================================================== */

export function RefundsScreen() {
  const lookups = useLookups();
  const refunds = useAsync(() => getRepo().refunds.list(), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [payoutFor, setPayoutFor] = useState<Refund | null>(null);
  const [payoutRef, setPayoutRef] = useState("");

  const act = async (id: string, fn: () => Promise<unknown>, msg: string) => {
    setBusy(id);
    try {
      await fn();
      toast.success(msg);
      refunds.reload();
    } catch (e) {
      toast.error(isDataError(e) ? e.message : "Action failed", isDataError(e) ? e.code : undefined);
    } finally {
      setBusy(null);
    }
  };

  const totals = useMemo(() => {
    const d = refunds.data ?? [];
    return {
      requested: d.filter((r) => r.status === "requested").reduce((s, r) => s + r.amount, 0),
      approved: d.filter((r) => r.status === "approved").reduce((s, r) => s + r.amount, 0),
      paid: d.filter((r) => r.status === "paid").reduce((s, r) => s + r.amount, 0),
    };
  }, [refunds.data]);

  const columns: Column<Refund>[] = [
    {
      key: "serial",
      header: "Serial",
      width: "150px",
      sortValue: (r) => r.serial,
      cell: (r) => <span className="font-mono text-[0.74rem] text-ink-muted">{r.serial}</span>,
    },
    {
      key: "who",
      header: "Participant",
      sortValue: (r) => lookups.participant(r.participantId)?.fullName ?? "",
      cell: (r) => (
        <span className="font-medium text-ink">
          {lookups.participant(r.participantId)?.fullName ?? "—"}
        </span>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      width: "104px",
      align: "right",
      sortValue: (r) => r.amount,
      cell: (r) => <span className="tnum font-semibold text-ink">{inr(r.amount)}</span>,
    },
    {
      key: "reason",
      header: "Reason",
      width: "150px",
      sortValue: (r) => r.reasonCode,
      cell: (r) => <span className="text-[0.78rem] text-ink-soft">{titleCase(r.reasonCode)}</span>,
    },
    {
      key: "status",
      header: "Status",
      width: "112px",
      sortValue: (r) => r.status,
      cell: (r) => (
        <StatusBadge tone={REFUND_TONE[r.status]} size="sm">
          {titleCase(r.status)}
        </StatusBadge>
      ),
    },
    {
      key: "requested",
      header: "Requested",
      width: "104px",
      hideBelow: "md",
      sortValue: (r) => r.requestedAt,
      cell: (r) => <span className="text-[0.76rem] text-ink-muted">{relativeTime(r.requestedAt)}</span>,
    },
    {
      key: "actions",
      header: "",
      width: "180px",
      align: "right",
      cell: (r) => (
        <div className="flex justify-end gap-1.5">
          {r.status === "requested" ? (
            <>
              <NeoButton
                size="sm"
                variant="secondary"
                loading={busy === r.id}
                onClick={() => act(r.id, () => getRepo().refunds.approve(r.id), "Refund approved")}
              >
                Approve
              </NeoButton>
              <NeoButton
                size="sm"
                variant="ghost"
                loading={busy === r.id}
                onClick={() =>
                  act(r.id, () => getRepo().refunds.reject(r.id, "Not eligible"), "Refund rejected")
                }
              >
                Reject
              </NeoButton>
            </>
          ) : r.status === "approved" ? (
            <NeoButton
              size="sm"
              variant="primary"
              onClick={() => {
                setPayoutFor(r);
                setPayoutRef("");
              }}
            >
              Mark paid
            </NeoButton>
          ) : (
            <span className="font-mono text-[0.7rem] text-ink-faint">{r.payoutRef ?? "—"}</span>
          )}
        </div>
      ),
    },
  ];

  return (
    <Page>
      <PageHeader
        title="Refunds & cancellations"
        description="A refund cannot exceed what was actually collected on that payment, and only the Registration Head can approve one. Both rules are enforced in the data layer, not just the UI."
      />
      <PaymentsNav />

      <StatGrid cols={3}>
        <NeoStatTile
          label="Awaiting approval"
          value={inr(totals.requested, { compact: true })}
          icon={<ArrowRightLeft />}
          deltaLabel={`${(refunds.data ?? []).filter((r) => r.status === "requested").length} requests`}
        />
        <NeoStatTile
          label="Approved, unpaid"
          value={inr(totals.approved, { compact: true })}
          icon={<Banknote />}
          deltaLabel="Awaiting transfer"
        />
        <NeoStatTile
          label="Paid out"
          value={inr(totals.paid, { compact: true })}
          icon={<CheckCheck />}
        />
      </StatGrid>

      <NeoCard>
        <NeoCard.Body flush>
          <DataTable
            rows={refunds.data ?? []}
            columns={columns}
            rowKey={(r) => r.id}
            loading={refunds.loading}
            sort={{ key: "requested", dir: "desc" }}
            pageSize={25}
            empty={<EmptyState title="No refunds" hint="Nothing has been requested yet." />}
          />
        </NeoCard.Body>
      </NeoCard>

      <NeoModal
        open={!!payoutFor}
        onOpenChange={(v) => !v && setPayoutFor(null)}
        title="Record the payout"
        description="Enter the UTR of the outgoing transfer so the refund can be reconciled against the bank statement later."
        footer={
          <>
            <NeoButton variant="ghost" onClick={() => setPayoutFor(null)}>
              Cancel
            </NeoButton>
            <NeoButton
              variant="primary"
              disabled={payoutRef.trim().length < 6}
              onClick={async () => {
                if (!payoutFor) return;
                const r = payoutFor;
                setPayoutFor(null);
                await act(r.id, () => getRepo().refunds.markPaid(r.id, payoutRef), "Refund paid");
              }}
            >
              Mark paid
            </NeoButton>
          </>
        }
      >
        {payoutFor ? (
          <div className="space-y-3">
            <dl className="divide-y divide-hairline">
              <KeyValue label="Serial" value={payoutFor.serial} mono />
              <KeyValue
                label="Participant"
                value={lookups.participant(payoutFor.participantId)?.fullName ?? "—"}
              />
              <KeyValue label="Amount" value={inr(payoutFor.amount)} />
            </dl>
            <NeoInput
              label="Payout UTR"
              mono
              value={payoutRef}
              onChange={(e) => setPayoutRef(e.target.value)}
              placeholder="12-digit transaction reference"
            />
          </div>
        ) : null}
      </NeoModal>
    </Page>
  );
}

/* ==========================================================================
   Reconciliation — the thing that makes end-of-fest accounting survivable.
   ========================================================================== */

export function SettlementsScreen() {
  const lookups = useLookups();
  const settlements = useAsync(() => getRepo().settlements.list(), []);
  const unmatched = useAsync(() => getRepo().settlements.unmatched(), []);
  const [busy, setBusy] = useState(false);
  const [matchFor, setMatchFor] = useState<Settlement | null>(null);

  const handleFile = async (file: File) => {
    setBusy(true);
    try {
      const rows = parseCsv(await file.text());
      const res = await getRepo().settlements.importStatement(rows);
      toast.success(
        `Imported ${res.imported} bank lines`,
        `${res.matched} matched automatically; ${res.imported - res.matched} need a human.`,
      );
      settlements.reload();
      unmatched.reload();
    } catch (e) {
      toast.error("Import failed", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const stats = useMemo(() => {
    const all = settlements.data ?? [];
    return {
      total: all.length,
      matched: all.filter((s) => s.matchedPaymentId).length,
      bankValue: all.reduce((s, x) => s + x.amount, 0),
    };
  }, [settlements.data]);

  const bankCols: Column<Settlement>[] = [
    {
      key: "ref",
      header: "Bank ref",
      width: "150px",
      sortValue: (s) => s.bankRef,
      cell: (s) => <span className="font-mono text-[0.74rem] text-ink-muted">{s.bankRef}</span>,
    },
    {
      key: "amount",
      header: "Amount",
      width: "104px",
      align: "right",
      sortValue: (s) => s.amount,
      cell: (s) => <span className="tnum font-semibold text-ink">{inr(s.amount)}</span>,
    },
    {
      key: "date",
      header: "Value date",
      width: "104px",
      sortValue: (s) => s.valueDate,
      cell: (s) => <span className="text-[0.76rem] text-ink-muted">{s.valueDate}</span>,
    },
    {
      key: "narration",
      header: "Narration",
      cell: (s) => <span className="truncate text-[0.74rem] text-ink-faint">{s.narration}</span>,
    },
    {
      key: "action",
      header: "",
      width: "96px",
      align: "right",
      cell: (s) => (
        <NeoButton size="sm" variant="secondary" icon={<Link2 />} onClick={() => setMatchFor(s)}>
          Match
        </NeoButton>
      ),
    },
  ];

  const appCols: Column<Payment>[] = [
    {
      key: "who",
      header: "Participant",
      sortValue: (p) => lookups.participant(p.participantId)?.fullName ?? "",
      cell: (p) => (
        <span className="font-medium text-ink">
          {lookups.participant(p.participantId)?.fullName ?? "—"}
        </span>
      ),
    },
    {
      key: "utr",
      header: "UTR",
      width: "150px",
      cell: (p) => <span className="font-mono text-[0.74rem] text-ink-muted">{p.utr ?? "—"}</span>,
    },
    {
      key: "amount",
      header: "Amount",
      width: "104px",
      align: "right",
      sortValue: (p) => p.amount,
      cell: (p) => <span className="tnum font-semibold text-ink">{inr(p.amount)}</span>,
    },
    {
      key: "date",
      header: "Submitted",
      width: "104px",
      sortValue: (p) => p.submittedAt,
      cell: (p) => <span className="text-[0.76rem] text-ink-muted">{relativeTime(p.submittedAt)}</span>,
    },
  ];

  return (
    <Page>
      <PageHeader
        title="Bank reconciliation"
        description="Import the account statement and auto-match it against the ledger on UTR, then amount and date. What is left over is the actual work: money in the bank with no record, and records with no money."
        actions={
          <>
            <NeoButton
              size="sm"
              variant="secondary"
              icon={<Download />}
              onClick={() =>
                downloadCsv("bank-statement-template.csv", [
                  ["Date", "Ref", "Narration", "Amount"],
                  ["2026-01-28", "402812349901", `UPI/402812349901/${FEST.name}/AUR26-00042`, "450"],
                ])
              }
            >
              Statement template
            </NeoButton>
            {/* A styled <label> rather than a button — a <button> nested in a
                label does not reliably forward the click to the file input. */}
            <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-neo-sm bg-ink px-3 text-[0.78rem] font-medium text-canvas transition-all hover:-translate-y-px hover:brightness-110">
              <Upload className="size-3.5" />
              {busy ? "Importing…" : "Import statement"}
              <input
                type="file"
                accept=".csv"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </label>
          </>
        }
      />
      <PaymentsNav />

      <StatGrid cols={4}>
        <NeoStatTile label="Bank lines" value={stats.total.toLocaleString("en-IN")} icon={<Banknote />} />
        <NeoStatTile
          label="Auto-matched"
          value={stats.matched.toLocaleString("en-IN")}
          icon={<Link2 />}
          deltaLabel={`${stats.total ? Math.round((stats.matched / stats.total) * 100) : 0}% of lines`}
        />
        <NeoStatTile
          label="In bank, not in app"
          value={(unmatched.data?.inBank.length ?? 0).toLocaleString("en-IN")}
          icon={<Unlink />}
          deltaLabel="Unidentified credits"
        />
        <NeoStatTile
          label="In app, not in bank"
          value={(unmatched.data?.inApp.length ?? 0).toLocaleString("en-IN")}
          icon={<ShieldAlert />}
          deltaLabel="Verified but no credit found"
        />
      </StatGrid>

      <div className="grid gap-4 xl:grid-cols-2">
        <NeoCard>
          <NeoCard.Header
            eyebrow="Worklist 1"
            title="In the bank, not in the app"
            subtitle="Money arrived that no payment record claims. Usually a wrong reference."
          />
          <NeoCard.Body flush>
            {unmatched.loading ? (
              <div className="p-4">
                <NeoSkeleton className="h-40" />
              </div>
            ) : (
              <DataTable
                rows={unmatched.data?.inBank ?? []}
                columns={bankCols}
                rowKey={(s) => s.id}
                pageSize={12}
                empty={<EmptyState title="Nothing unmatched" hint="Every credit is accounted for." />}
              />
            )}
          </NeoCard.Body>
        </NeoCard>

        <NeoCard>
          <NeoCard.Header
            eyebrow="Worklist 2"
            title="In the app, not in the bank"
            subtitle="Verified payments with no matching credit. Either the statement is stale, or the receipt was fake."
          />
          <NeoCard.Body flush>
            {unmatched.loading ? (
              <div className="p-4">
                <NeoSkeleton className="h-40" />
              </div>
            ) : (
              <DataTable
                rows={unmatched.data?.inApp ?? []}
                columns={appCols}
                rowKey={(p) => p.id}
                pageSize={12}
                empty={<EmptyState title="All verified payments matched" />}
              />
            )}
          </NeoCard.Body>
        </NeoCard>
      </div>

      <NeoModal
        open={!!matchFor}
        onOpenChange={(v) => !v && setMatchFor(null)}
        title="Match to a payment"
        description="Pick the ledger record this bank credit belongs to."
        size="lg"
      >
        {matchFor ? (
          <div className="space-y-3">
            <div className="neo-inset-sm rounded-neo p-3">
              <dl className="divide-y divide-hairline">
                <KeyValue label="Bank ref" value={matchFor.bankRef} mono />
                <KeyValue label="Amount" value={inr(matchFor.amount)} />
                <KeyValue label="Narration" value={matchFor.narration} />
              </dl>
            </div>
            <p className="engraved">Closest candidates by amount</p>
            <ul className="space-y-1.5">
              {(unmatched.data?.inApp ?? [])
                .filter((p) => Math.abs(p.amount - matchFor.amount) <= 200)
                .slice(0, 8)
                .map((p) => (
                  <li key={p.id}>
                    <button
                      onClick={async () => {
                        const s = matchFor;
                        setMatchFor(null);
                        try {
                          await getRepo().settlements.match(s.id, p.id);
                          toast.success("Matched", `${s.bankRef} → ${p.id}`);
                          settlements.reload();
                          unmatched.reload();
                        } catch {
                          toast.error("Could not match");
                        }
                      }}
                      className="flex w-full items-center gap-3 rounded-neo bg-plane-alt px-3 py-2.5 text-left transition-colors hover:bg-plane"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.84rem] font-medium text-ink">
                          {lookups.participant(p.participantId)?.fullName}
                        </span>
                        <span className="block font-mono text-[0.72rem] text-ink-muted">
                          {p.utr ?? "no UTR"} · {p.submittedAt.slice(0, 10)}
                        </span>
                      </span>
                      <span className="tnum shrink-0 font-semibold text-ink">{inr(p.amount)}</span>
                    </button>
                  </li>
                ))}
              {!(unmatched.data?.inApp ?? []).some(
                (p) => Math.abs(p.amount - matchFor.amount) <= 200,
              ) ? (
                <li className="py-6 text-center text-[0.82rem] text-ink-muted">
                  No ledger record within ₹200 of this credit.
                </li>
              ) : null}
            </ul>
          </div>
        ) : null}
      </NeoModal>
    </Page>
  );
}

/* ==========================================================================
   Fraud lane
   ========================================================================== */

export function FraudScreen() {
  const lookups = useLookups();
  const flagged = useAsync(() => getRepo().payments.list({ flaggedOnly: true }), []);
  const [busy, setBusy] = useState(false);

  const sweep = async () => {
    setBusy(true);
    try {
      const res = await getRepo().payments.runFraudSweep();
      toast.success("Sweep complete", `${res.length} payments carry a flag.`);
      flagged.reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <PageHeader
        title="Flagged payments"
        description="Automated checks across the whole ledger: a UTR claimed twice, the same receipt image submitted by two people, a breakdown that does not sum, or a payment timestamped before the registration it settles."
        actions={
          <NeoButton size="sm" variant="primary" icon={<ShieldAlert />} loading={busy} onClick={sweep}>
            Run sweep
          </NeoButton>
        }
      />
      <PaymentsNav />

      {flagged.loading ? (
        <NeoSkeleton className="h-64 rounded-neo-lg" />
      ) : !flagged.data?.length ? (
        <NeoCard>
          <NeoCard.Body>
            <EmptyState
              icon={<CheckCheck />}
              title="Nothing flagged"
              hint="Run the sweep after a batch of verifications to re-check."
            />
          </NeoCard.Body>
        </NeoCard>
      ) : (
        <div className="space-y-3">
          {flagged.data.map((p) => {
            const who = lookups.participant(p.participantId);
            return (
              <NeoCard key={p.id}>
                <NeoCard.Header
                  eyebrow={p.utr ? `UTR ${p.utr}` : p.method ? titleCase(p.method) : "Not recorded"}
                  title={who?.fullName ?? "Unknown"}
                  subtitle={`${who?.code ?? ""} · ${lookups.collegeOf(p.participantId)?.shortName ?? ""}`}
                  actions={
                    <>
                      <StatusBadge tone="failed" size="sm">
                        {p.fraudFlags.length} flag{p.fraudFlags.length > 1 ? "s" : ""}
                      </StatusBadge>
                      <span className="tnum font-display text-[1.05rem] font-semibold text-ink">
                        {inr(p.amount)}
                      </span>
                    </>
                  }
                />
                <NeoCard.Body>
                  <ul className="space-y-2">
                    {p.fraudFlags.map((f, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <StatusBadge tone={f.severity === "block" ? "failed" : "pending"} size="sm">
                          {f.severity}
                        </StatusBadge>
                        <span className="min-w-0 flex-1 text-[0.8rem] text-ink-soft">
                          <span className="font-semibold text-ink">{titleCase(f.kind)}</span> —{" "}
                          {f.detail}
                        </span>
                      </li>
                    ))}
                  </ul>
                </NeoCard.Body>
              </NeoCard>
            );
          })}
        </div>
      )}
    </Page>
  );
}

/* ==========================================================================
   Cash drawer — every desk shift has to balance.
   ========================================================================== */

export function DrawerScreen() {
  const lookups = useLookups();
  const shifts = useAsync(() => getRepo().desk.shifts(), []);
  const [closeFor, setCloseFor] = useState<string | null>(null);
  const [counted, setCounted] = useState("");
  const [handover, setHandover] = useState("");

  const rows = (shifts.data ?? []).slice().sort((a, b) => (a.startsAt < b.startsAt ? 1 : -1));

  return (
    <Page>
      <PageHeader
        title="Cash drawer"
        description="Cash collected at the desk, per shift, per volunteer. A shift that does not balance is flagged here rather than discovered three weeks later."
      />
      <PaymentsNav />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((s) => {
          const expected = s.openingFloat + s.expectedCash;
          const variance = s.countedCash == null ? null : s.countedCash - expected;
          return (
            <NeoCard key={s.id}>
              <NeoCard.Header
                eyebrow={`${s.deskName} · ${s.day.toUpperCase()}`}
                title={lookups.staffMember(s.staffId)?.name ?? s.staffId}
                subtitle={new Date(s.startsAt).toLocaleString("en-IN", {
                  day: "numeric",
                  month: "short",
                  hour: "numeric",
                  minute: "2-digit",
                })}
                actions={
                  <StatusBadge
                    size="sm"
                    tone={s.status === "open" ? "info" : s.status === "closed" ? "neutral" : "pending"}
                  >
                    {titleCase(s.status)}
                  </StatusBadge>
                }
              />
              <NeoCard.Body>
                <dl className="divide-y divide-hairline">
                  <KeyValue label="Opening float" value={inr(s.openingFloat)} />
                  <KeyValue label="Cash collected" value={inr(s.expectedCash)} />
                  <KeyValue label="Expected in drawer" value={inr(expected)} />
                  {s.countedCash != null ? (
                    <KeyValue label="Counted" value={inr(s.countedCash)} />
                  ) : null}
                </dl>

                {variance != null ? (
                  <div
                    className={`mt-3 rounded-neo p-2.5 text-center ${
                      variance === 0 ? "bg-paid-bg" : "bg-failed-bg"
                    }`}
                  >
                    <div className="engraved mb-1 !text-[0.56rem]">Variance</div>
                    <div
                      className={`tnum font-display text-[1.1rem] font-bold ${
                        variance === 0 ? "text-paid" : "text-failed"
                      }`}
                    >
                      {variance === 0 ? "Balanced" : inr(variance)}
                    </div>
                  </div>
                ) : s.status === "open" ? (
                  <NeoButton
                    block
                    size="sm"
                    variant="primary"
                    className="mt-3"
                    onClick={() => {
                      setCloseFor(s.id);
                      setCounted(String(expected));
                      setHandover("");
                    }}
                  >
                    Close & count
                  </NeoButton>
                ) : null}
              </NeoCard.Body>
            </NeoCard>
          );
        })}
      </div>

      <NeoModal
        open={!!closeFor}
        onOpenChange={(v) => !v && setCloseFor(null)}
        title="Close the shift"
        description="Count the drawer physically, then enter what is actually in it. Any variance is recorded against this shift and this volunteer."
        footer={
          <>
            <NeoButton variant="ghost" onClick={() => setCloseFor(null)}>
              Cancel
            </NeoButton>
            <NeoButton
              variant="primary"
              disabled={!handover}
              onClick={async () => {
                if (!closeFor) return;
                const id = closeFor;
                setCloseFor(null);
                try {
                  const res = await getRepo().desk.closeShift(id, Number(counted), handover);
                  const variance =
                    (res.countedCash ?? 0) - (res.openingFloat + res.expectedCash);
                  if (variance === 0) toast.success("Shift closed — drawer balanced");
                  else
                    toast.warning(
                      "Shift closed with a variance",
                      `${inr(variance)} ${variance > 0 ? "over" : "short"}. Recorded in the audit log.`,
                    );
                  shifts.reload();
                } catch (e) {
                  toast.error(isDataError(e) ? e.message : "Could not close the shift");
                }
              }}
            >
              Close shift
            </NeoButton>
          </>
        }
      >
        <div className="space-y-3">
          <NeoInput
            label="Counted cash"
            type="number"
            mono
            value={counted}
            onChange={(e) => setCounted(e.target.value)}
            suffix="INR"
          />
          <div>
            <label className="engraved mb-1.5 block">Hand over to</label>
            <div className="flex flex-wrap gap-1.5">
              {lookups.staff
                .filter((st) => st.role === "desk" || st.role === "head")
                .map((st) => (
                  <button
                    key={st.id}
                    onClick={() => setHandover(st.id)}
                    className={`rounded-full px-3 py-1.5 text-[0.78rem] transition-colors ${
                      handover === st.id
                        ? "bg-ink text-canvas"
                        : "bg-neutral-bg text-ink-soft hover:text-ink"
                    }`}
                  >
                    {st.name}
                  </button>
                ))}
            </div>
          </div>
        </div>
      </NeoModal>
    </Page>
  );
}
