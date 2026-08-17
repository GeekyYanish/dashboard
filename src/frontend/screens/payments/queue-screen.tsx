"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  X,
  RotateCcw,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  Zap,
} from "lucide-react";
import { Page, PageHeader } from "@/frontend/components/page";
import { PaymentsNav } from "./payments-nav";
import {
  NeoCard,
  NeoButton,
  StatusBadge,
  KeyValue,
  SectionRule,
  NeoAvatar,
  EmptyState,
  NeoSkeleton,
  Kbd,
  NeoModal,
  NeoTextarea,
  toast,
} from "@/frontend/components/neo";
import { GatedButton } from "@/frontend/components/gated";
import { useAsync } from "@/frontend/hooks/use-async";
import { useLookups } from "@/frontend/hooks/use-lookups";
import { getRepo } from "@/lib/data";
import { isDataError, type Payment } from "@/lib/data/types";
import { PAYMENT_METHODS, inr } from "@/lib/fest.config";
import { slaLabel, slaTone, titleCase } from "@/frontend/status";
import { cn, hoursSince, relativeTime } from "@/lib/utils";

const REJECT_REASONS = [
  "Screenshot unreadable — please re-upload",
  "UTR does not match any bank credit",
  "Amount short of the fee due",
  "Receipt belongs to a different participant",
  "Duplicate of an earlier payment",
];

/**
 * The verification queue.
 *
 * This screen gets worked hundreds of items at a time, so it is built to be
 * driven entirely from the keyboard: J/K to move, A to approve, R to reject,
 * U to request a re-upload. Reaching for a mouse per item is the difference
 * between clearing the queue in an hour and not clearing it at all.
 */
export function QueueScreen() {
  const lookups = useLookups();
  const queue = useAsync(() => getRepo().payments.queue(), []);
  const [cursor, setCursor] = useState(0);
  const [busy, setBusy] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectNote, setRejectNote] = useState(REJECT_REASONS[0]);

  // Wrapped so the derived useMemo below does not see a new array identity
  // on every render.
  const items = useMemo(() => queue.data ?? [], [queue.data]);
  const current = items[Math.min(cursor, items.length - 1)];

  const advance = useCallback(() => {
    setCursor((c) => Math.min(Math.max(0, items.length - 2), c));
  }, [items.length]);

  const review = useCallback(
    async (decision: "verified" | "rejected" | "resubmit", note?: string) => {
      if (!current) return;
      setBusy(true);
      try {
        const res = await getRepo().payments.review(current.id, decision, note);
        toast.success(
          decision === "verified"
            ? `Verified ${inr(current.amount)}`
            : decision === "rejected"
              ? "Payment rejected"
              : "Re-upload requested",
          decision === "verified" && res.invoiceSerial
            ? `Invoice ${res.invoiceSerial} issued; registrations confirmed.`
            : note,
        );
        advance();
        queue.reload();
      } catch (e) {
        toast.error(isDataError(e) ? e.message : "Review failed", isDataError(e) ? e.code : undefined);
      } finally {
        setBusy(false);
      }
    },
    [current, advance, queue],
  );

  // Keyboard driver. Inert while a field has focus so typing a reject note
  // does not approve the next item.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el as HTMLElement | null)?.isContentEditable
      )
        return;
      const k = e.key.toLowerCase();
      if (k === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setCursor((c) => Math.min(items.length - 1, c + 1));
      } else if (k === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setCursor((c) => Math.max(0, c - 1));
      } else if (k === "a" && !busy) {
        e.preventDefault();
        review("verified");
      } else if (k === "r" && !busy) {
        e.preventDefault();
        setRejectOpen(true);
      } else if (k === "u" && !busy) {
        e.preventDefault();
        review("resubmit", "Please upload a clearer receipt");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items.length, busy, review]);

  const breached = useMemo(
    () => items.filter((p) => hoursSince(p.submittedAt) > 24).length,
    [items],
  );

  return (
    <Page>
      <PageHeader
        title="Verification queue"
        description="Oldest first. The team's SLA is 24 hours — anything red has breached it."
        actions={
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 text-[0.75rem] text-ink-muted sm:flex">
              <Kbd>J</Kbd>
              <Kbd>K</Kbd> move
              <Kbd>A</Kbd> approve
              <Kbd>R</Kbd> reject
              <Kbd>U</Kbd> re-upload
            </span>
            <NeoButton
              size="sm"
              variant="secondary"
              icon={<Zap />}
              onClick={async () => {
                const flagged = await getRepo().payments.runFraudSweep();
                toast.info(
                  `Fraud sweep complete`,
                  `${flagged.length} payments carry a flag. Review them before verifying.`,
                );
                queue.reload();
              }}
            >
              Run fraud sweep
            </NeoButton>
          </div>
        }
      />

      <PaymentsNav />

      {breached > 0 ? (
        <div className="flex items-start gap-2.5 rounded-neo bg-failed-bg p-3">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-failed" />
          <p className="text-[0.8rem] leading-snug text-ink-soft">
            <span className="font-semibold text-ink">{breached} payments past the 24h SLA.</span>{" "}
            Every hour one of these sits here is an hour a participant does not know whether they
            are registered.
          </p>
        </div>
      ) : null}

      {queue.loading ? (
        <NeoSkeleton className="h-96 rounded-neo-lg" />
      ) : !items.length ? (
        <NeoCard>
          <NeoCard.Body>
            <EmptyState
              icon={<Check />}
              title="Queue is clear"
              hint="Every submitted payment has been reviewed. This is the goal."
            />
          </NeoCard.Body>
        </NeoCard>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          {/* Queue list */}
          <NeoCard className="lg:max-h-[calc(100dvh-16rem)] lg:overflow-hidden">
            <NeoCard.Header
              eyebrow="Queue"
              title={`${items.length} awaiting review`}
              subtitle={`Oldest ${slaLabel(hoursSince(items[0].submittedAt))}`}
            />
            <NeoCard.Body flush className="lg:max-h-[calc(100dvh-22rem)] lg:overflow-y-auto">
              <ul className="divide-y divide-hairline">
                {items.slice(0, 200).map((p, i) => {
                  const who = lookups.participant(p.participantId);
                  const age = hoursSince(p.submittedAt);
                  return (
                    <li key={p.id}>
                      <button
                        onClick={() => setCursor(i)}
                        className={cn(
                          "flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors",
                          i === cursor ? "bg-signal-soft/60" : "hover:bg-plane-alt",
                        )}
                      >
                        <NeoAvatar name={who?.fullName ?? "?"} size={28} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[0.82rem] font-medium text-ink">
                            {who?.fullName ?? "Unknown"}
                          </span>
                          <span className="tnum block truncate text-[0.72rem] text-ink-muted">
                            {inr(p.amount)} · {p.method ? titleCase(p.method) : "Not recorded"}
                          </span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-1">
                          <StatusBadge tone={slaTone(age)} size="sm" dot={false}>
                            {slaLabel(age)}
                          </StatusBadge>
                          {p.fraudFlags.length ? (
                            <ShieldAlert className="size-3.5 text-failed" />
                          ) : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </NeoCard.Body>
            {items.length > 200 ? (
              <NeoCard.Footer>
                <span>Showing the first 200 of {items.length}.</span>
              </NeoCard.Footer>
            ) : null}
          </NeoCard>

          {/* Reviewer */}
          {current ? (
            <ReviewPane
              payment={current}
              lookups={lookups}
              busy={busy}
              index={cursor}
              total={items.length}
              onPrev={() => setCursor((c) => Math.max(0, c - 1))}
              onNext={() => setCursor((c) => Math.min(items.length - 1, c + 1))}
              onApprove={() => review("verified")}
              onReject={() => setRejectOpen(true)}
              onResubmit={() => review("resubmit", "Please upload a clearer receipt")}
            />
          ) : null}
        </div>
      )}

      <NeoModal
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title="Reject this payment"
        description="The reason is sent to the participant and recorded in the audit log — write something they can act on."
        footer={
          <>
            <NeoButton variant="ghost" onClick={() => setRejectOpen(false)}>
              Cancel
            </NeoButton>
            <NeoButton
              variant="danger"
              loading={busy}
              onClick={async () => {
                setRejectOpen(false);
                await review("rejected", rejectNote);
              }}
            >
              Reject payment
            </NeoButton>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {REJECT_REASONS.map((r) => (
              <button
                key={r}
                onClick={() => setRejectNote(r)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[0.75rem] transition-colors",
                  rejectNote === r
                    ? "bg-ink text-canvas"
                    : "bg-neutral-bg text-ink-soft hover:text-ink",
                )}
              >
                {r}
              </button>
            ))}
          </div>
          <NeoTextarea
            label="Reason"
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
          />
        </div>
      </NeoModal>
    </Page>
  );
}

/**
 * Renders the uploaded receipt.
 *
 * The URL is fetched per payment rather than carried on the Payment record: the
 * backend signs it with a signature that expires in minutes, so anything cached
 * in a list would be dead on arrival. Fetching it also produces the
 * `payment_receipt_viewed` audit row on the backend.
 *
 * PDFs go in an <object> and images in an <img> — a PDF in an <img> renders
 * nothing at all, which is what made receipts look "not viewing". The file type
 * comes from the stored filename, since a signed Cloudinary URL carries query
 * parameters and need not end in a usable extension.
 */
function ReceiptView({ payment }: { payment: Payment }) {
  const receipt = useAsync(() => getRepo().payments.receiptUrl(payment.id), [payment.id]);
  const name = payment.receiptFileName ?? "";
  const isPdf = /\.pdf$/i.test(name);

  // No filename means nothing was ever uploaded — a cash payment taken at the
  // desk. Checked before the fetch state so it never flashes a loading skeleton.
  if (!name) {
    return (
      <div>
        <p className="text-[0.85rem] font-semibold text-ink">Cash at desk</p>
        <p className="mt-1 text-[0.75rem] text-ink-muted">
          No receipt uploaded — verify against the shift drawer.
        </p>
      </div>
    );
  }

  if (receipt.loading) {
    return <NeoSkeleton className="size-full rounded-neo" />;
  }

  if (receipt.error) {
    return (
      <div role="alert">
        <p className="text-[0.8rem] font-semibold text-failed">Receipt could not be loaded</p>
        <p className="mt-1 text-[0.74rem] text-ink-muted">
          {isDataError(receipt.error) ? receipt.error.message : "Try again in a moment."}
        </p>
        <NeoButton size="sm" variant="secondary" className="mt-3" onClick={receipt.reload}>
          Retry
        </NeoButton>
      </div>
    );
  }

  if (!receipt.data) {
    return (
      <div>
        <p className="text-[0.85rem] font-semibold text-ink">Receipt unavailable</p>
        <p className="mt-1 max-w-[24ch] text-[0.75rem] text-ink-muted">
          {name} was recorded, but the file could not be retrieved.
        </p>
      </div>
    );
  }

  return (
    <div className="flex size-full flex-col gap-2">
      {isPdf ? (
        <object data={receipt.data} type="application/pdf" className="min-h-0 flex-1 rounded-neo">
          {/* Browsers with no inline PDF plugin fall through to this. */}
          <div className="grid size-full place-items-center p-4 text-center">
            <p className="text-[0.75rem] text-ink-muted">
              This browser cannot display PDFs inline.
            </p>
          </div>
        </object>
      ) : (
        <img
          src={receipt.data}
          alt={`Payment receipt ${name || payment.id}`}
          className="min-h-0 flex-1 rounded-neo object-contain"
        />
      )}
      <div className="flex shrink-0 items-center justify-between gap-2">
        <span className="truncate font-mono text-[0.68rem] text-ink-faint">{name || "receipt"}</span>
        <a
          href={receipt.data}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-[0.72rem] font-semibold text-ink-soft underline"
        >
          Open full size
        </a>
      </div>
    </div>
  );
}

function ReviewPane({
  payment,
  lookups,
  busy,
  index,
  total,
  onPrev,
  onNext,
  onApprove,
  onReject,
  onResubmit,
}: {
  payment: Payment;
  lookups: ReturnType<typeof useLookups>;
  busy: boolean;
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onApprove: () => void;
  onReject: () => void;
  onResubmit: () => void;
}) {
  const who = lookups.participant(payment.participantId);
  const college = lookups.collegeOf(payment.participantId);
  const age = hoursSince(payment.submittedAt);
  const sum = payment.breakdown.reduce((s, b) => s + b.amount, 0);

  const flags = useAsync(
    () => getRepo().participants.flags(payment.participantId),
    [payment.participantId],
  );

  return (
    <NeoCard>
      <NeoCard.Header
        eyebrow={`${index + 1} of ${total}`}
        title={who?.fullName ?? "Unknown participant"}
        subtitle={`${who?.code ?? ""} · ${college?.name ?? ""}`}
        actions={
          <div className="flex items-center gap-1">
            <NeoButton size="sm" variant="ghost" onClick={onPrev} icon={<ChevronUp />}>
              <span className="sr-only">Previous</span>
            </NeoButton>
            <NeoButton size="sm" variant="ghost" onClick={onNext} icon={<ChevronDown />}>
              <span className="sr-only">Next</span>
            </NeoButton>
          </div>
        }
      />

      <NeoCard.Raw className="space-y-4">
        {payment.fraudFlags.length ? (
          <div className="rounded-neo bg-failed-bg p-3">
            <div className="mb-1.5 flex items-center gap-2">
              <ShieldAlert className="size-4 text-failed" />
              <span className="text-[0.82rem] font-semibold text-failed">
                Flagged — do not verify without checking
              </span>
            </div>
            <ul className="space-y-1">
              {payment.fraudFlags.map((f, i) => (
                <li key={i} className="text-[0.78rem] text-ink-soft">
                  <span className="font-medium">{titleCase(f.kind)}:</span> {f.detail}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          {/* Receipt */}
          <div>
            <SectionRule label="Receipt" className="mb-2" />
            <div className="neo-inset grid aspect-[3/4] place-items-center rounded-neo p-4 text-center">
              <ReceiptView payment={payment} />
            </div>
          </div>

          {/* Claim */}
          <div className="space-y-3">
            <SectionRule label="The claim" />
            <div className="neo-inset-sm rounded-neo p-3">
              <div className="tnum font-display text-[1.7rem] font-bold leading-none text-ink">
                {inr(payment.amount)}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <StatusBadge tone="info" size="sm" dot={false}>
                  {PAYMENT_METHODS.find((m) => m.id === payment.method)?.label ?? "Not recorded"}
                </StatusBadge>
                <StatusBadge tone={slaTone(age)} size="sm" dot={false}>
                  Waiting {slaLabel(age)}
                </StatusBadge>
              </div>
            </div>

            <dl className="divide-y divide-hairline">
              {payment.utr ? <KeyValue label="UTR" value={payment.utr} mono /> : null}
              <KeyValue label="Submitted" value={relativeTime(payment.submittedAt)} />
              <KeyValue label="Phone" value={who?.phone ?? "—"} mono />
              <KeyValue label="Settles" value={`${payment.registrationIds.length} registrations`} />
              {flags.data ? (
                <KeyValue
                  label="Total due"
                  value={inr(flags.data.amountDue + flags.data.amountPaid)}
                />
              ) : null}
            </dl>

            <div>
              <SectionRule label="Fee breakdown" className="mb-2" />
              <div className="space-y-1">
                {payment.breakdown.map((b, i) => (
                  <div key={i} className="flex justify-between text-[0.78rem]">
                    <span className="text-ink-muted">{b.label}</span>
                    <span className={b.amount < 0 ? "tnum text-paid" : "tnum text-ink-soft"}>
                      {inr(b.amount)}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between border-t border-hairline pt-1.5 text-[0.82rem] font-semibold">
                  <span className="text-ink">Total</span>
                  <span className={cn("tnum", sum === payment.amount ? "text-ink" : "text-failed")}>
                    {inr(sum)}
                  </span>
                </div>
                {sum !== payment.amount ? (
                  <p className="text-[0.72rem] text-failed">
                    Breakdown does not match the amount charged — reject and ask for a correction.
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </NeoCard.Raw>

      <NeoCard.Footer className="!py-3">
        <span className="text-[0.75rem]">
          Verifying issues an invoice serial and confirms the linked registrations.
        </span>
        <div className="flex gap-2">
          <GatedButton
            capability="payments.verify"
            size="sm" variant="secondary" icon={<RotateCcw />} loading={busy} onClick={onResubmit}
          >
            Re-upload
          </GatedButton>
          <GatedButton
            capability="payments.verify"
            size="sm" variant="danger" icon={<X />} loading={busy} onClick={onReject}
          >
            Reject
          </GatedButton>
          <GatedButton
            capability="payments.verify"
            size="sm" variant="primary" icon={<Check />} loading={busy} onClick={onApprove}
          >
            Verify
          </GatedButton>
        </div>
      </NeoCard.Footer>
    </NeoCard>
  );
}
