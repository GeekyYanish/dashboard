"use client";

import { useState } from "react";
import { Check, X, Undo2, ShieldAlert } from "lucide-react";
import {
  NeoDrawer,
  NeoButton,
  StatusBadge,
  KeyValue,
  SectionRule,
  NeoSkeleton,
  NeoModal,
  NeoInput,
  NeoSelect,
  toast,
} from "@/frontend/components/neo";
import { useAsync } from "@/frontend/hooks/use-async";
import { useLookups } from "@/frontend/hooks/use-lookups";
import { getRepo } from "@/lib/data";
import { isDataError, type Refund } from "@/lib/data/types";
import { PAYMENT_METHODS, inr } from "@/lib/fest.config";
import { PAYMENT_LABEL, PAYMENT_TONE, titleCase } from "@/frontend/status";
import { relativeTime } from "@/lib/utils";

const REFUND_REASONS: { value: Refund["reasonCode"]; label: string }[] = [
  { value: "event_cancelled", label: "Event cancelled" },
  { value: "withdrawal", label: "Participant withdrew" },
  { value: "duplicate_payment", label: "Duplicate payment" },
  { value: "overcharge", label: "Overcharged" },
  { value: "other", label: "Other" },
];

export function PaymentDrawer({
  paymentId,
  onClose,
  onChanged,
}: {
  paymentId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const lookups = useLookups();
  const [busy, setBusy] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState<Refund["reasonCode"]>("withdrawal");

  const pay = useAsync(
    () => (paymentId ? getRepo().payments.get(paymentId) : Promise.resolve(null)),
    [paymentId],
  );
  const refunds = useAsync(() => getRepo().refunds.list(), [paymentId]);
  const p = pay.data;
  const who = p ? lookups.participant(p.participantId) : undefined;
  const mine = (refunds.data ?? []).filter((r) => r.paymentId === paymentId);

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(msg);
      pay.reload();
      refunds.reload();
      onChanged();
    } catch (e) {
      toast.error(isDataError(e) ? e.message : "Action failed", isDataError(e) ? e.code : undefined);
    } finally {
      setBusy(false);
    }
  };

  const refundable = p
    ? p.amount - mine.filter((r) => r.status !== "rejected").reduce((s, r) => s + r.amount, 0)
    : 0;

  return (
    <>
      <NeoDrawer
        open={!!paymentId}
        onOpenChange={(v) => !v && onClose()}
        eyebrow={p ? `${p.method ? titleCase(p.method) : "Not recorded"} · ${relativeTime(p.submittedAt)}` : undefined}
        title={who?.fullName ?? "Payment"}
        footer={
          p ? (
            <>
              {p.status === "verified" ? (
                <NeoButton
                  size="sm"
                  variant="secondary"
                  icon={<Undo2 />}
                  disabled={refundable <= 0}
                  onClick={() => {
                    setRefundAmount(String(refundable));
                    setRefundOpen(true);
                  }}
                >
                  Refund
                </NeoButton>
              ) : null}
              {p.status === "pending" ? (
                <>
                  <NeoButton
                    size="sm"
                    variant="danger"
                    icon={<X />}
                    loading={busy}
                    onClick={() =>
                      act(
                        () => getRepo().payments.review(p.id, "rejected", "Rejected from ledger"),
                        "Payment rejected",
                      )
                    }
                  >
                    Reject
                  </NeoButton>
                  <NeoButton
                    size="sm"
                    variant="primary"
                    icon={<Check />}
                    loading={busy}
                    onClick={() =>
                      act(() => getRepo().payments.review(p.id, "verified"), "Payment verified")
                    }
                  >
                    Verify
                  </NeoButton>
                </>
              ) : null}
            </>
          ) : null
        }
      >
        {!p ? (
          <NeoSkeleton className="h-64" />
        ) : (
          <div className="space-y-4">
            <div className="neo-inset-sm rounded-neo p-3.5">
              <div className="tnum font-display text-[1.9rem] font-bold leading-none text-ink">
                {inr(p.amount)}
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <StatusBadge tone={PAYMENT_TONE[p.status]} size="sm">
                  {PAYMENT_LABEL[p.status]}
                </StatusBadge>
                <StatusBadge tone="info" size="sm" dot={false}>
                  {PAYMENT_METHODS.find((m) => m.id === p.method)?.label ?? "Not recorded"}
                </StatusBadge>
                {p.fraudFlags.length ? (
                  <StatusBadge tone="failed" size="sm">
                    Flagged
                  </StatusBadge>
                ) : null}
              </div>
            </div>

            {p.fraudFlags.length ? (
              <div className="rounded-neo bg-failed-bg p-3">
                <div className="mb-1.5 flex items-center gap-2">
                  <ShieldAlert className="size-4 text-failed" />
                  <span className="text-[0.8rem] font-semibold text-failed">Fraud checks</span>
                </div>
                {p.fraudFlags.map((f, i) => (
                  <p key={i} className="text-[0.76rem] text-ink-soft">
                    <span className="font-medium">{titleCase(f.kind)}:</span> {f.detail}
                  </p>
                ))}
              </div>
            ) : null}

            <div>
              <SectionRule label="Transaction" className="mb-2" />
              <dl className="divide-y divide-hairline">
                <KeyValue label="Payment ID" value={p.id} mono />
                {p.invoiceSerial ? <KeyValue label="Invoice" value={p.invoiceSerial} mono /> : null}
                {p.utr ? <KeyValue label="UTR" value={p.utr} mono /> : null}
                <KeyValue label="Participant" value={who?.fullName ?? "—"} />
                <KeyValue label="College" value={lookups.collegeOf(p.participantId)?.name ?? "—"} />
                <KeyValue label="Submitted" value={relativeTime(p.submittedAt)} />
                {p.reviewedAt ? (
                  <KeyValue
                    label="Reviewed"
                    value={`${lookups.staffMember(p.reviewedBy)?.name ?? "—"} · ${relativeTime(p.reviewedAt)}`}
                  />
                ) : null}
                {p.reviewNote ? <KeyValue label="Note" value={p.reviewNote} /> : null}
              </dl>
            </div>

            <div>
              <SectionRule label="Fee breakdown" className="mb-2" />
              <div className="space-y-1">
                {p.breakdown.map((b, i) => (
                  <div key={i} className="flex justify-between text-[0.8rem]">
                    <span className="text-ink-muted">{b.label}</span>
                    <span className={b.amount < 0 ? "tnum text-paid" : "tnum text-ink-soft"}>
                      {inr(b.amount)}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between border-t border-hairline pt-1.5 text-[0.85rem] font-semibold text-ink">
                  <span>Total</span>
                  <span className="tnum">{inr(p.amount)}</span>
                </div>
              </div>
            </div>

            {mine.length ? (
              <div>
                <SectionRule label="Refunds" className="mb-2" />
                <ul className="space-y-1.5">
                  {mine.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center gap-2 rounded-neo-sm bg-plane-alt px-2.5 py-2"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block font-mono text-[0.72rem] text-ink-muted">
                          {r.serial}
                        </span>
                        <span className="block text-[0.75rem] text-ink-faint">
                          {titleCase(r.reasonCode)}
                        </span>
                      </span>
                      <span className="tnum text-[0.8rem] font-semibold text-ink">
                        {inr(r.amount)}
                      </span>
                      <StatusBadge
                        size="sm"
                        tone={
                          r.status === "paid"
                            ? "paid"
                            : r.status === "rejected"
                              ? "failed"
                              : "pending"
                        }
                      >
                        {titleCase(r.status)}
                      </StatusBadge>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </NeoDrawer>

      <NeoModal
        open={refundOpen}
        onOpenChange={setRefundOpen}
        title="Request a refund"
        description={`Up to ${inr(refundable)} is still refundable on this payment. Requests need the Registration Head's approval before payout.`}
        footer={
          <>
            <NeoButton variant="ghost" onClick={() => setRefundOpen(false)}>
              Cancel
            </NeoButton>
            <NeoButton
              variant="primary"
              loading={busy}
              onClick={async () => {
                if (!p) return;
                setRefundOpen(false);
                await act(
                  () =>
                    getRepo().refunds.request({
                      paymentId: p.id,
                      amount: Number(refundAmount),
                      reasonCode: refundReason,
                    }),
                  "Refund requested",
                );
              }}
            >
              Request refund
            </NeoButton>
          </>
        }
      >
        <div className="space-y-3">
          <NeoInput
            label="Amount"
            type="number"
            mono
            value={refundAmount}
            onChange={(e) => setRefundAmount(e.target.value)}
            suffix="INR"
            hint={`Cannot exceed ${inr(refundable)}`}
          />
          <NeoSelect
            label="Reason"
            value={refundReason}
            onChange={(e) => setRefundReason(e.target.value as Refund["reasonCode"])}
            options={REFUND_REASONS}
          />
        </div>
      </NeoModal>
    </>
  );
}
