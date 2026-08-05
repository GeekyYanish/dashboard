"use client";

import { useState } from "react";
import {
  CheckCheck,
  Ban,
  ArrowUpFromLine,
  Phone,
  Mail,
  GraduationCap,
  ShieldAlert,
} from "lucide-react";
import {
  NeoDrawer,
  NeoButton,
  StatusBadge,
  KeyValue,
  SectionRule,
  NeoAvatar,
  NeoTabs,
  NeoSkeleton,
  toast,
} from "@/frontend/components/neo";
import { useAsync } from "@/frontend/hooks/use-async";
import { useLookups } from "@/frontend/hooks/use-lookups";
import { getRepo } from "@/lib/data";
import { isDataError } from "@/lib/data/types";
import { CATEGORIES, DOC_TYPES, inr } from "@/lib/fest.config";
import {
  DOC_TONE,
  PAYMENT_LABEL,
  PAYMENT_TONE,
  REGISTRATION_LABEL,
  REGISTRATION_TONE,
  titleCase,
} from "@/frontend/status";
import { relativeTime } from "@/lib/utils";

type Tab = "overview" | "payments" | "documents" | "activity";

/**
 * The 360° record. Everything the desk needs to answer "what is going on with
 * this person" without navigating away from a filtered list — which is why it
 * is a drawer and not a page.
 */
export function RegistrationDrawer({
  registrationId,
  onClose,
  onChanged,
}: {
  registrationId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const [busy, setBusy] = useState(false);
  const lookups = useLookups();

  const reg = useAsync(
    () => (registrationId ? getRepo().registrations.get(registrationId) : Promise.resolve(null)),
    [registrationId],
  );
  const pid = reg.data?.participantId;

  const flags = useAsync(
    () => (pid ? getRepo().participants.flags(pid) : Promise.resolve(null)),
    [pid],
  );
  const allRegs = useAsync(
    () => (pid ? getRepo().registrations.forParticipant(pid) : Promise.resolve([])),
    [pid],
  );
  const payments = useAsync(
    () => (pid ? getRepo().payments.forParticipant(pid) : Promise.resolve([])),
    [pid],
  );
  const docs = useAsync(
    () => (pid ? getRepo().documents.forParticipant(pid) : Promise.resolve([])),
    [pid],
  );
  const activity = useAsync(
    () =>
      registrationId
        ? getRepo().audit.list({ entity: "registration", limit: 40 })
        : Promise.resolve([]),
    [registrationId],
  );

  const r = reg.data;
  const p = pid ? lookups.participant(pid) : undefined;
  const college = pid ? lookups.collegeOf(pid) : undefined;
  const event = r ? lookups.event(r.eventId) : undefined;

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(msg);
      reg.reload();
      allRegs.reload();
      onChanged();
    } catch (e) {
      toast.error(isDataError(e) ? e.message : "Action failed", isDataError(e) ? e.code : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <NeoDrawer
      open={!!registrationId}
      onOpenChange={(v) => !v && onClose()}
      width="lg"
      eyebrow={r ? `${r.code} · ${event?.title ?? ""}` : undefined}
      title={p?.fullName ?? "Registration"}
      footer={
        r ? (
          <>
            <NeoButton
              size="sm"
              variant="secondary"
              icon={<ArrowUpFromLine />}
              loading={busy}
              onClick={() =>
                act(
                  () => getRepo().registrations.setStatus(r.id, "waitlisted"),
                  "Moved to the waitlist",
                )
              }
            >
              Waitlist
            </NeoButton>
            <NeoButton
              size="sm"
              variant="danger"
              icon={<Ban />}
              loading={busy}
              onClick={() =>
                act(async () => {
                  const res = await getRepo().registrations.cancel(r.id, "withdrawal");
                  if (res.promoted)
                    toast.info(
                      "Waitlister promoted",
                      `${res.promoted.code} moved off the waitlist into the freed seat.`,
                    );
                }, "Registration cancelled")
              }
            >
              Cancel
            </NeoButton>
            <NeoButton
              size="sm"
              variant="primary"
              icon={<CheckCheck />}
              loading={busy}
              disabled={r.status === "confirmed"}
              onClick={() =>
                act(
                  () => getRepo().registrations.setStatus(r.id, "confirmed"),
                  "Registration confirmed",
                )
              }
            >
              Confirm
            </NeoButton>
          </>
        ) : null
      }
    >
      {!r || !p ? (
        <div className="space-y-3">
          <NeoSkeleton className="h-24" />
          <NeoSkeleton className="h-40" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Identity block */}
          <div className="neo-inset-sm flex items-start gap-3 rounded-neo p-3.5">
            <NeoAvatar name={p.fullName} size={44} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display text-[0.98rem] font-semibold text-ink">
                  {p.fullName}
                </span>
                <StatusBadge tone={REGISTRATION_TONE[r.status]} size="sm">
                  {REGISTRATION_LABEL[r.status]}
                </StatusBadge>
                {flags.data?.isMinor ? (
                  <StatusBadge tone="pending" size="sm" dot={false}>
                    Under 18
                  </StatusBadge>
                ) : null}
              </div>
              <p className="mt-1 font-mono text-[0.74rem] text-ink-muted">{p.code}</p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.76rem] text-ink-muted">
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="size-3" />
                  {p.phone}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="size-3" />
                  {p.email}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <GraduationCap className="size-3" />
                  {college?.shortName} · {p.department}, Year {p.yearOfStudy}
                </span>
              </div>
            </div>
          </div>

          {/* Money at a glance — the first thing anyone asks about. */}
          {flags.data ? (
            <div className="grid grid-cols-3 gap-2">
              <MiniStat label="Paid" value={inr(flags.data.amountPaid)} tone="paid" />
              <MiniStat
                label="Due"
                value={inr(flags.data.amountDue)}
                tone={flags.data.amountDue > 0 ? "failed" : "paid"}
              />
              <MiniStat
                label="Documents"
                value={flags.data.docsComplete ? "Complete" : `${flags.data.missingDocs.length} missing`}
                tone={flags.data.docsComplete ? "paid" : "pending"}
              />
            </div>
          ) : null}

          {flags.data && !flags.data.docsComplete ? (
            <div className="flex items-start gap-2.5 rounded-neo bg-pending-bg p-3">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-pending" />
              <div className="min-w-0 text-[0.78rem] leading-snug text-ink-soft">
                <span className="font-semibold text-ink">Badge blocked.</span> Missing{" "}
                {flags.data.missingDocs
                  .map((d) => DOC_TYPES.find((x) => x.id === d)?.label ?? d)
                  .join(", ")}
                .
              </div>
            </div>
          ) : null}

          <NeoTabs
            value={tab}
            onChange={setTab}
            tabs={[
              { value: "overview", label: "Overview" },
              { value: "payments", label: "Payments", count: payments.data?.length },
              { value: "documents", label: "Documents", count: docs.data?.length },
              { value: "activity", label: "Activity" },
            ]}
          />

          {tab === "overview" ? (
            <div className="space-y-4">
              <div>
                <SectionRule label="This registration" className="mb-2" />
                <dl className="divide-y divide-hairline">
                  <KeyValue label="Registration ID" value={r.code} mono />
                  <KeyValue label="Event" value={event?.title ?? "—"} />
                  <KeyValue label="Venue" value={event?.venue ?? "—"} />
                  <KeyValue label="Fee" value={inr(r.feeInr)} />
                  <KeyValue label="Source" value={titleCase(r.source)} />
                  <KeyValue label="Registered" value={relativeTime(r.registeredAt)} />
                  {r.confirmedAt ? (
                    <KeyValue label="Confirmed" value={relativeTime(r.confirmedAt)} />
                  ) : null}
                  {r.cancelReason ? (
                    <KeyValue label="Cancel reason" value={titleCase(r.cancelReason)} />
                  ) : null}
                </dl>
              </div>

              <div>
                <SectionRule label="Participant details" className="mb-2" />
                <dl className="divide-y divide-hairline">
                  <KeyValue
                    label="Category"
                    value={CATEGORIES.find((c) => c.id === p.category)?.label ?? p.category}
                  />
                  <KeyValue label="Gender" value={titleCase(p.gender)} />
                  <KeyValue label="Date of birth" value={p.dateOfBirth} />
                  <KeyValue label="T-shirt" value={p.tshirtSize} />
                  <KeyValue label="Dietary" value={titleCase(p.dietaryPref)} />
                  <KeyValue label="Emergency" value={`${p.emergencyName} · ${p.emergencyPhone}`} />
                </dl>
              </div>

              <div>
                <SectionRule label={`All events (${allRegs.data?.length ?? 0})`} className="mb-2" />
                <ul className="space-y-1.5">
                  {(allRegs.data ?? []).map((x) => (
                    <li
                      key={x.id}
                      className="flex items-center gap-2 rounded-neo-sm bg-plane-alt px-2.5 py-2"
                    >
                      <span className="min-w-0 flex-1 truncate text-[0.8rem] text-ink-soft">
                        {lookups.event(x.eventId)?.title ?? x.eventId}
                      </span>
                      <span className="tnum text-[0.75rem] text-ink-muted">{inr(x.feeInr)}</span>
                      <StatusBadge tone={REGISTRATION_TONE[x.status]} size="sm">
                        {REGISTRATION_LABEL[x.status]}
                      </StatusBadge>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}

          {tab === "payments" ? (
            <div className="space-y-3">
              {(payments.data ?? []).length === 0 ? (
                <p className="py-8 text-center text-[0.85rem] text-ink-muted">
                  No payment recorded yet.
                </p>
              ) : (
                (payments.data ?? []).map((pay) => (
                  <div key={pay.id} className="rounded-neo bg-plane-alt p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="tnum font-display text-[1rem] font-semibold text-ink">
                        {inr(pay.amount)}
                      </span>
                      <StatusBadge tone={PAYMENT_TONE[pay.status]} size="sm">
                        {PAYMENT_LABEL[pay.status]}
                      </StatusBadge>
                    </div>
                    <dl className="divide-y divide-hairline">
                      <KeyValue label="Method" value={titleCase(pay.method)} />
                      {pay.utr ? <KeyValue label="UTR" value={pay.utr} mono /> : null}
                      {pay.invoiceSerial ? (
                        <KeyValue label="Invoice" value={pay.invoiceSerial} mono />
                      ) : null}
                      <KeyValue label="Submitted" value={relativeTime(pay.submittedAt)} />
                      {pay.reviewNote ? (
                        <KeyValue label="Review note" value={pay.reviewNote} />
                      ) : null}
                    </dl>
                    <div className="mt-2 space-y-0.5 border-t border-hairline pt-2">
                      {pay.breakdown.map((b, i) => (
                        <div key={i} className="flex justify-between text-[0.75rem]">
                          <span className="text-ink-muted">{b.label}</span>
                          <span
                            className={
                              b.amount < 0 ? "tnum text-paid" : "tnum text-ink-soft"
                            }
                          >
                            {inr(b.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                    {pay.fraudFlags.length ? (
                      <div className="mt-2 rounded-neo-sm bg-failed-bg p-2 text-[0.74rem] text-failed">
                        {pay.fraudFlags.map((f) => f.detail).join(" · ")}
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          ) : null}

          {tab === "documents" ? (
            <ul className="space-y-1.5">
              {(docs.data ?? []).length === 0 ? (
                <p className="py-8 text-center text-[0.85rem] text-ink-muted">
                  Nothing uploaded yet.
                </p>
              ) : (
                (docs.data ?? []).map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center gap-2.5 rounded-neo-sm bg-plane-alt px-3 py-2.5"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.82rem] text-ink-soft">
                        {DOC_TYPES.find((x) => x.id === d.docType)?.label ?? d.docType}
                      </span>
                      <span className="block truncate font-mono text-[0.7rem] text-ink-faint">
                        {d.fileName}
                      </span>
                    </span>
                    <StatusBadge tone={DOC_TONE[d.status]} size="sm">
                      {titleCase(d.status)}
                    </StatusBadge>
                  </li>
                ))
              )}
            </ul>
          ) : null}

          {tab === "activity" ? (
            <ul className="space-y-2">
              {(activity.data ?? [])
                .filter((a) => a.entityId === r.id || a.entity === "registration")
                .slice(0, 20)
                .map((a) => (
                  <li key={a.id} className="flex items-start gap-2.5">
                    <NeoAvatar name={a.actorName} size={24} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.78rem] text-ink-soft">
                        <span className="font-semibold text-ink">{a.actorName}</span>{" "}
                        <span className="font-mono text-[0.72rem]">{a.action}</span>
                      </p>
                      <p className="text-[0.7rem] text-ink-faint">
                        {relativeTime(a.at)}
                        {a.note ? ` · ${a.note}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
            </ul>
          ) : null}
        </div>
      )}
    </NeoDrawer>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "paid" | "failed" | "pending";
}) {
  const cls = {
    paid: "text-paid",
    failed: "text-failed",
    pending: "text-pending",
  }[tone];
  return (
    <div className="neo-inset-sm rounded-neo p-2.5 text-center">
      <div className="engraved mb-1 !text-[0.56rem]">{label}</div>
      <div className={`tnum font-display text-[0.95rem] font-semibold ${cls}`}>{value}</div>
    </div>
  );
}
