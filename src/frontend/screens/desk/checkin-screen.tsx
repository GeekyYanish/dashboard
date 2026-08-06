"use client";

import { useMemo, useState } from "react";
import { ScanLine, Check, UserX, ArrowUpFromLine, Download } from "lucide-react";
import { Page, PageHeader, StatGrid } from "@/frontend/components/page";
import {
  NeoCard,
  NeoButton,
  NeoSearchField,
  NeoSelect,
  NeoStatTile,
  StatusBadge,
  NeoAvatar,
  DataTable,
  EmptyState,
  NeoSegmented,
  NeoProgress,
  toast,
  type Column,
} from "@/frontend/components/neo";
import { BarChart } from "@/frontend/components/charts";
import { useAsync, useDebounced } from "@/frontend/hooks/use-async";
import { useLookups } from "@/frontend/hooks/use-lookups";
import { getRepo } from "@/lib/data";
import { isDataError, type Registration } from "@/lib/data/types";
import { FEST } from "@/lib/fest.config";
import { downloadCsv, relativeTime } from "@/lib/utils";

/**
 * Check-in.
 *
 * Idempotent by construction — the gate volunteer will scan the same badge
 * twice, and a second scan must not double-count attendance or re-award
 * anything. The repository returns `wasAlready` so the UI can say so plainly
 * instead of silently doing nothing.
 */
export function CheckinScreen() {
  const lookups = useLookups();
  const [mode, setMode] = useState<"gate" | "event" | "noshow">("gate");
  const [query, setQuery] = useState("");
  const dQuery = useDebounced(query, 160);
  const [eventId, setEventId] = useState("");
  const [recent, setRecent] = useState<{ name: string; already: boolean; at: string }[]>([]);

  const attendance = useAsync(() => getRepo().attendance.list(), []);
  const results = useAsync(
    () => (dQuery.trim().length >= 2 ? getRepo().participants.search(dQuery, 6) : Promise.resolve([])),
    [dQuery],
  );
  const noShows = useAsync(
    () => (eventId ? getRepo().attendance.noShows(eventId) : Promise.resolve([])),
    [eventId],
  );
  const eventStats = useAsync(
    () => (eventId ? getRepo().events.stats(eventId) : Promise.resolve(null)),
    [eventId],
  );

  const byDay = useMemo(
    () =>
      FEST.days.map((d) => ({
        label: d.label,
        value: (attendance.data ?? []).filter((a) => a.day === d.key).length,
        slot: 0,
      })),
    [attendance.data],
  );

  const todayCount = (attendance.data ?? []).length;
  const uniquePeople = new Set((attendance.data ?? []).map((a) => a.participantId)).size;

  const doCheckIn = async (participantId: string, name: string) => {
    try {
      const res = await getRepo().attendance.checkIn({
        participantId,
        eventId: mode === "event" && eventId ? eventId : null,
        method: "manual",
      });
      setRecent((r) => [{ name, already: res.wasAlready, at: res.record.checkedInAt }, ...r].slice(0, 8));
      if (res.wasAlready) toast.info("Already checked in", `${name} — no duplicate recorded.`);
      else toast.success("Checked in", name);
      attendance.reload();
      setQuery("");
    } catch (e) {
      toast.error(isDataError(e) ? e.message : "Check-in failed");
    }
  };

  const noShowCols: Column<Registration>[] = [
    {
      key: "who",
      header: "Participant",
      sortValue: (r) => lookups.participant(r.participantId)?.fullName ?? "",
      cell: (r) => {
        const p = lookups.participant(r.participantId);
        return (
          <div className="flex min-w-0 items-center gap-2.5">
            <NeoAvatar name={p?.fullName ?? "?"} size={28} />
            <div className="min-w-0">
              <div className="truncate font-medium text-ink">{p?.fullName}</div>
              <div className="truncate text-[0.72rem] text-ink-muted">
                {lookups.college(p?.collegeId ?? "")?.shortName} · {p?.phone}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      key: "code",
      header: "Reg ID",
      width: "104px",
      cell: (r) => <span className="font-mono text-[0.75rem] text-ink-muted">{r.code}</span>,
    },
    {
      key: "action",
      header: "",
      width: "220px",
      align: "right",
      cell: (r) => (
        <div className="flex justify-end gap-1.5">
          <NeoButton
            size="sm"
            variant="secondary"
            icon={<Check />}
            onClick={() =>
              doCheckIn(r.participantId, lookups.participant(r.participantId)?.fullName ?? "")
            }
          >
            Late check-in
          </NeoButton>
          <NeoButton
            size="sm"
            variant="ghost"
            icon={<ArrowUpFromLine />}
            onClick={async () => {
              const wl = await getRepo().registrations.waitlist(r.eventId);
              if (!wl.length) {
                toast.info("Nobody on the waitlist", "This seat cannot be reallocated.");
                return;
              }
              await getRepo().registrations.cancel(r.id, "no_show");
              toast.success(
                "Seat reallocated",
                `${lookups.participant(wl[0].participantId)?.fullName ?? "Next in queue"} promoted off the waitlist.`,
              );
              noShows.reload();
            }}
          >
            Reallocate
          </NeoButton>
        </div>
      ),
    },
  ];

  return (
    <Page>
      <PageHeader
        title="Check-in"
        description="Venue gate and per-event attendance. Scanning the same badge twice is a no-op by design — the second scan reports it rather than double-counting."
        actions={
          <NeoButton
            size="sm"
            variant="secondary"
            icon={<Download />}
            onClick={() =>
              downloadCsv("attendance.csv", [
                ["Participant", "Code", "College", "Event", "Day", "Method", "Checked in"],
                ...(attendance.data ?? []).map((a) => {
                  const p = lookups.participant(a.participantId);
                  return [
                    p?.fullName ?? "", p?.code ?? "",
                    lookups.college(p?.collegeId ?? "")?.name ?? "",
                    a.eventId ? (lookups.event(a.eventId)?.title ?? "") : "Venue gate",
                    a.day, a.method, a.checkedInAt,
                  ];
                }),
              ])
            }
          >
            Export attendance
          </NeoButton>
        }
      />

      <StatGrid cols={4}>
        <NeoStatTile label="Total check-ins" value={todayCount.toLocaleString("en-IN")} icon={<ScanLine />} />
        <NeoStatTile label="Unique people" value={uniquePeople.toLocaleString("en-IN")} icon={<Check />} />
        <NeoStatTile
          label="No-shows"
          value={(noShows.data?.length ?? 0).toLocaleString("en-IN")}
          icon={<UserX />}
          deltaLabel={eventId ? "For the selected event" : "Pick an event"}
        />
        <NeoStatTile
          label="Fest days"
          value={FEST.days.length}
          deltaLabel={FEST.days.map((d) => d.label).join(" · ")}
        />
      </StatGrid>

      <NeoSegmented
        value={mode}
        onChange={setMode}
        options={[
          { value: "gate", label: "Venue gate" },
          { value: "event", label: "Event check-in" },
          { value: "noshow", label: "No-shows" },
        ]}
      />

      {mode !== "noshow" ? (
        <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
          <NeoCard>
            <NeoCard.Header
              eyebrow={mode === "gate" ? "Venue gate" : "Per event"}
              title="Scan or search"
              subtitle="Scan a badge QR, or type a name, code or phone number."
              icon={<ScanLine />}
            />
            <NeoCard.Raw className="space-y-3">
              {mode === "event" ? (
                <NeoSelect
                  label="Event"
                  value={eventId}
                  onChange={(e) => setEventId(e.target.value)}
                  placeholder="Choose an event…"
                  options={lookups.events
                    .filter((e) => e.status !== "cancelled")
                    .map((e) => ({ value: e.id, label: e.title }))}
                />
              ) : null}

              <NeoSearchField
                size="lg"
                autoFocus
                value={query}
                onValueChange={setQuery}
                placeholder="Badge code, name or phone…"
              />

              <div className="space-y-1.5">
                {(results.data ?? []).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => doCheckIn(p.id, p.fullName)}
                    className="flex w-full items-center gap-3 rounded-neo bg-plane-alt px-3 py-3 text-left transition-colors hover:bg-plane"
                  >
                    <NeoAvatar name={p.fullName} size={38} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.92rem] font-semibold text-ink">
                        {p.fullName}
                      </span>
                      <span className="block truncate font-mono text-[0.76rem] text-ink-muted">
                        {p.code} · {lookups.college(p.collegeId)?.shortName}
                      </span>
                    </span>
                    <Check className="size-5 shrink-0 text-paid" />
                  </button>
                ))}
              </div>

              {eventStats.data && mode === "event" ? (
                <NeoProgress
                  value={eventStats.data.checkedInCount}
                  max={Math.max(1, eventStats.data.confirmedCount)}
                  tone="paid"
                  label={`${eventStats.data.checkedInCount} of ${eventStats.data.confirmedCount} confirmed have arrived`}
                  showValue
                />
              ) : null}
            </NeoCard.Raw>
          </NeoCard>

          <div className="space-y-4">
            <NeoCard>
              <NeoCard.Header eyebrow="Just now" title="Recent check-ins" />
              <NeoCard.Body flush>
                {recent.length === 0 ? (
                  <EmptyState
                    title="Nothing yet today"
                    hint={`Check-ins appear here as they happen. Attendance opens on ${FEST.days[0].label} — ${new Date(FEST.startsAt).toLocaleDateString("en-IN", { day: "numeric", month: "long" })}.`}
                  />
                ) : (
                  <ul className="divide-y divide-hairline">
                    {recent.map((r, i) => (
                      <li key={i} className="flex items-center gap-3 px-4 py-2.5">
                        <NeoAvatar name={r.name} size={28} />
                        <span className="min-w-0 flex-1 truncate text-[0.85rem] font-medium text-ink">
                          {r.name}
                        </span>
                        <StatusBadge tone={r.already ? "neutral" : "paid"} size="sm">
                          {r.already ? "Already in" : "Checked in"}
                        </StatusBadge>
                      </li>
                    ))}
                  </ul>
                )}
              </NeoCard.Body>
            </NeoCard>

            <NeoCard>
              <NeoCard.Header eyebrow="By day" title="Attendance" />
              <NeoCard.Raw>
                <BarChart data={byDay} height={160} />
              </NeoCard.Raw>
            </NeoCard>
          </div>
        </div>
      ) : (
        <NeoCard>
          <NeoCard.Header
            eyebrow="Reallocation"
            title="Confirmed but never arrived"
            subtitle="A no-show seat can be released to the next person on the waitlist."
            icon={<UserX />}
            actions={
              <NeoSelect
                value={eventId}
                onChange={(e) => setEventId(e.target.value)}
                placeholder="Choose an event…"
                className="w-56"
                options={lookups.events
                  .filter((e) => e.status !== "cancelled")
                  .map((e) => ({ value: e.id, label: e.title }))}
              />
            }
          />
          <NeoCard.Body flush>
            {!eventId ? (
              <EmptyState title="Pick an event" hint="No-shows are calculated per event." />
            ) : (
              <DataTable
                rows={noShows.data ?? []}
                columns={noShowCols}
                rowKey={(r) => r.id}
                loading={noShows.loading}
                pageSize={20}
                empty={<EmptyState title="No no-shows" hint="Nobody confirmed for this event has failed to arrive — or the event has not run yet." />}
              />
            )}
          </NeoCard.Body>
        </NeoCard>
      )}
    </Page>
  );
}
