"use client";

import { useState } from "react";
import { CopyCheck, CalendarClock, ArrowUpFromLine, Merge, ListOrdered } from "lucide-react";
import { Page, PageHeader, SubNav } from "@/frontend/components/page";
import {
  NeoCard,
  NeoButton,
  StatusBadge,
  NeoAvatar,
  EmptyState,
  NeoSelect,
  NeoSkeleton,
  toast,
  KeyValue,
} from "@/frontend/components/neo";
import { useAsync } from "@/frontend/hooks/use-async";
import { useLookups } from "@/frontend/hooks/use-lookups";
import { getRepo } from "@/lib/data";
import { isDataError } from "@/lib/data/types";
import { REGISTRATION_LABEL, REGISTRATION_TONE } from "@/frontend/status";
import { relativeTime } from "@/lib/utils";

const LINKS = [
  { href: "/registrations", label: "All" },
  { href: "/registrations/waitlist", label: "Waitlist" },
  { href: "/registrations/duplicates", label: "Duplicates" },
  { href: "/registrations/clashes", label: "Clashes" },
  { href: "/registrations/import", label: "Import" },
];

/* ==========================================================================
   Duplicates — the same human entered twice. Always happens once a college
   emails a list that overlaps with people who already self-registered.
   ========================================================================== */

export function DuplicatesScreen() {
  const dupes = useAsync(() => getRepo().participants.findDuplicates(), []);
  const lookups = useLookups();
  const [busy, setBusy] = useState<string | null>(null);

  const merge = async (keepId: string, mergeId: string) => {
    setBusy(mergeId);
    try {
      await getRepo().participants.merge(keepId, mergeId);
      toast.success("Records merged", "Registrations, payments and documents were re-pointed.");
      dupes.reload();
      lookups.reload();
    } catch (e) {
      toast.error(isDataError(e) ? e.message : "Merge failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Page>
      <PageHeader
        title="Duplicate participants"
        description="Fuzzy matches on phone number and name. Merging re-points every registration, payment and document onto the record you keep — and cancels any registration that would collide."
      />
      <SubNav links={LINKS} />

      {dupes.loading ? (
        <NeoSkeleton className="h-64 rounded-neo-lg" />
      ) : !dupes.data?.length ? (
        <NeoCard>
          <NeoCard.Body>
            <EmptyState
              icon={<CopyCheck />}
              title="No duplicates detected"
              hint="Nothing matches on phone or name+email handle."
            />
          </NeoCard.Body>
        </NeoCard>
      ) : (
        <div className="space-y-3">
          {dupes.data.map(({ a, b, reason, score }) => (
            <NeoCard key={`${a.id}-${b.id}`}>
              <NeoCard.Header
                eyebrow={`${score}% confidence`}
                title={reason}
                actions={
                  <StatusBadge tone={score > 90 ? "failed" : "pending"} size="sm">
                    {score > 90 ? "Almost certain" : "Likely"}
                  </StatusBadge>
                }
              />
              <NeoCard.Raw>
                <div className="grid gap-3 md:grid-cols-2">
                  {[a, b].map((p, i) => {
                    const other = i === 0 ? b : a;
                    return (
                      <div key={p.id} className="neo-inset-sm rounded-neo p-3">
                        <div className="mb-2 flex items-center gap-2.5">
                          <NeoAvatar name={p.fullName} size={34} />
                          <div className="min-w-0">
                            <div className="truncate text-[0.86rem] font-semibold text-ink">
                              {p.fullName}
                            </div>
                            <div className="font-mono text-[0.72rem] text-ink-muted">{p.code}</div>
                          </div>
                        </div>
                        <dl className="divide-y divide-hairline">
                          <KeyValue label="Email" value={p.email} />
                          <KeyValue label="Phone" value={p.phone} mono />
                          <KeyValue
                            label="College"
                            value={lookups.college(p.collegeId)?.shortName ?? "—"}
                          />
                          <KeyValue label="Created" value={relativeTime(p.createdAt)} />
                          <KeyValue label="Source" value={p.createdVia.replace("_", " ")} />
                        </dl>
                        <NeoButton
                          block
                          size="sm"
                          variant="secondary"
                          icon={<Merge />}
                          className="mt-3"
                          loading={busy === other.id}
                          onClick={() => merge(p.id, other.id)}
                        >
                          Keep this, merge the other
                        </NeoButton>
                      </div>
                    );
                  })}
                </div>
              </NeoCard.Raw>
            </NeoCard>
          ))}
        </div>
      )}
    </Page>
  );
}

/* ==========================================================================
   Clashes — one person, two events, overlapping times. Nobody notices until
   the participant is standing in two venues at once.
   ========================================================================== */

export function ClashesScreen() {
  const clashes = useAsync(() => getRepo().registrations.clashes(), []);
  const venueClashes = useAsync(() => getRepo().events.venueClashes(), []);
  const lookups = useLookups();
  const [busy, setBusy] = useState<string | null>(null);

  const drop = async (id: string) => {
    setBusy(id);
    try {
      await getRepo().registrations.cancel(id, "clash");
      toast.success("Registration cancelled", "The clash is resolved and any waitlister promoted.");
      clashes.reload();
    } catch (e) {
      toast.error(isDataError(e) ? e.message : "Could not cancel");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Page>
      <PageHeader
        title="Schedule clashes"
        description="A participant registered for two events whose times overlap, or two events booked into the same venue at the same time."
      />
      <SubNav links={LINKS} />

      <NeoCard>
        <NeoCard.Header
          eyebrow="Participants"
          title={`${clashes.data?.length ?? 0} double-booked participants`}
          subtitle="One of the two registrations has to go — or the event has to move."
          icon={<CalendarClock />}
        />
        <NeoCard.Body flush>
          {clashes.loading ? (
            <div className="p-4">
              <NeoSkeleton className="h-32" />
            </div>
          ) : !clashes.data?.length ? (
            <EmptyState title="No participant clashes" hint="Everyone can be in one place at a time." />
          ) : (
            <ul className="divide-y divide-hairline">
              {clashes.data.slice(0, 60).map(({ participantId, a, b }) => {
                const p = lookups.participant(participantId);
                const ea = lookups.event(a.eventId);
                const eb = lookups.event(b.eventId);
                return (
                  <li key={`${a.id}-${b.id}`} className="px-4 py-3">
                    <div className="mb-2 flex items-center gap-2.5">
                      <NeoAvatar name={p?.fullName ?? "?"} size={28} />
                      <span className="text-[0.85rem] font-semibold text-ink">
                        {p?.fullName ?? "Unknown"}
                      </span>
                      <span className="font-mono text-[0.72rem] text-ink-muted">{p?.code}</span>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {[
                        { r: a, e: ea },
                        { r: b, e: eb },
                      ].map(({ r, e }) => (
                        <div
                          key={r.id}
                          className="flex items-center gap-2 rounded-neo-sm bg-plane-alt px-2.5 py-2"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[0.8rem] text-ink-soft">
                              {e?.title}
                            </span>
                            <span className="block text-[0.7rem] text-ink-faint">
                              {e?.venue} ·{" "}
                              {e ? new Date(e.startsAt).toLocaleString("en-IN", {
                                day: "numeric",
                                month: "short",
                                hour: "numeric",
                                minute: "2-digit",
                              }) : ""}
                            </span>
                          </span>
                          <StatusBadge tone={REGISTRATION_TONE[r.status]} size="sm">
                            {REGISTRATION_LABEL[r.status]}
                          </StatusBadge>
                          <NeoButton
                            size="sm"
                            variant="ghost"
                            loading={busy === r.id}
                            onClick={() => drop(r.id)}
                          >
                            Drop
                          </NeoButton>
                        </div>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </NeoCard.Body>
        {clashes.data && clashes.data.length > 60 ? (
          <NeoCard.Footer>
            <span>Showing the first 60 of {clashes.data.length} clashes.</span>
          </NeoCard.Footer>
        ) : null}
      </NeoCard>

      <NeoCard>
        <NeoCard.Header
          eyebrow="Venues"
          title={`${venueClashes.data?.length ?? 0} venue conflicts`}
          subtitle="Two events booked into the same room at overlapping times."
        />
        <NeoCard.Body flush>
          {!venueClashes.data?.length ? (
            <EmptyState title="No venue conflicts" />
          ) : (
            <ul className="divide-y divide-hairline">
              {venueClashes.data.map(({ a, b }) => (
                <li key={`${a.id}-${b.id}`} className="flex flex-wrap items-center gap-2 px-4 py-3">
                  <span className="min-w-0 flex-1 text-[0.82rem] text-ink-soft">
                    <span className="font-semibold text-ink">{a.title}</span> and{" "}
                    <span className="font-semibold text-ink">{b.title}</span>
                  </span>
                  <StatusBadge tone="pending" size="sm">
                    {a.venue}
                  </StatusBadge>
                </li>
              ))}
            </ul>
          )}
        </NeoCard.Body>
      </NeoCard>
    </Page>
  );
}

/* ==========================================================================
   Waitlist — a freed seat that nobody reallocates is lost revenue and a lost
   participant.
   ========================================================================== */

export function WaitlistScreen() {
  const events = useAsync(() => getRepo().events.list(), []);
  const [eventId, setEventId] = useState<string>("");
  const lookups = useLookups();
  const [busy, setBusy] = useState<string | null>(null);

  const list = useAsync(
    () => (eventId ? getRepo().registrations.waitlist(eventId) : Promise.resolve([])),
    [eventId],
  );

  const promote = async (id: string) => {
    setBusy(id);
    try {
      await getRepo().registrations.promote(id);
      toast.success("Promoted off the waitlist", "The registration is now pending payment.");
      list.reload();
    } catch (e) {
      toast.error(isDataError(e) ? e.message : "Could not promote");
    } finally {
      setBusy(null);
    }
  };

  const withWaitlist = (events.data ?? []).filter((e) => e.status !== "cancelled");

  return (
    <Page>
      <PageHeader
        title="Waitlist"
        description="Pick an event to see its queue in order. Promoting moves someone into a freed seat — cancellations do this automatically."
      />
      <SubNav links={LINKS} />

      <NeoCard>
        <NeoCard.Raw className="pt-[var(--card-p)]">
          <NeoSelect
            label="Event"
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            placeholder="Choose an event…"
            className="max-w-md"
            options={withWaitlist.map((e) => ({ value: e.id, label: e.title }))}
          />
        </NeoCard.Raw>
      </NeoCard>

      {eventId ? (
        <NeoCard>
          <NeoCard.Header
            eyebrow={lookups.event(eventId)?.title}
            title={`${list.data?.length ?? 0} waiting`}
            icon={<ListOrdered />}
          />
          <NeoCard.Body flush>
            {!list.data?.length ? (
              <EmptyState title="Nobody on this waitlist" />
            ) : (
              <ul className="divide-y divide-hairline">
                {list.data.map((r, i) => {
                  const p = lookups.participant(r.participantId);
                  return (
                    <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="tnum neo-inset-sm grid size-7 shrink-0 place-items-center rounded-full text-[0.72rem] font-bold text-ink-soft">
                        {r.waitlistPosition ?? i + 1}
                      </span>
                      <NeoAvatar name={p?.fullName ?? "?"} size={28} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.84rem] font-medium text-ink">
                          {p?.fullName}
                        </span>
                        <span className="block truncate text-[0.72rem] text-ink-muted">
                          {lookups.collegeOf(r.participantId)?.shortName} ·{" "}
                          {relativeTime(r.registeredAt)}
                        </span>
                      </span>
                      <NeoButton
                        size="sm"
                        variant="secondary"
                        icon={<ArrowUpFromLine />}
                        loading={busy === r.id}
                        onClick={() => promote(r.id)}
                      >
                        Promote
                      </NeoButton>
                    </li>
                  );
                })}
              </ul>
            )}
          </NeoCard.Body>
        </NeoCard>
      ) : null}
    </Page>
  );
}
