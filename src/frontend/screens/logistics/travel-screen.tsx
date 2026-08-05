"use client";

import { useMemo, useState } from "react";
import {
  Plane,
  TrainFront,
  Bus,
  Car,
  Truck,
  Download,
  Users,
  Clock,
  MapPin,
} from "lucide-react";
import { Page, PageHeader, StatGrid } from "@/frontend/components/page";
import {
  NeoCard,
  NeoButton,
  DataTable,
  StatusBadge,
  NeoStatTile,
  NeoAvatar,
  EmptyState,
  NeoSegmented,
  NeoProgress,
  NeoModal,
  KeyValue,
  NeoSkeleton,
  toast,
  type Column,
} from "@/frontend/components/neo";
import { useAsync } from "@/frontend/hooks/use-async";
import { useLookups } from "@/frontend/hooks/use-lookups";
import { getRepo } from "@/lib/data";
import { isDataError, type PickupSlot, type TravelRecord } from "@/lib/data/types";
import { TRAVEL_TONE, titleCase } from "@/frontend/status";
import { downloadCsv } from "@/lib/utils";

const MODE_ICON = {
  train: TrainFront,
  flight: Plane,
  bus: Bus,
  own: Car,
} as const;

/**
 * Travel & arrivals.
 *
 * Almost always missed when scoping a registration tool, and then improvised
 * over WhatsApp on arrival night. Out-station contingents land at odd hours;
 * somebody has to be at the station with a vehicle that has enough seats.
 */
export function TravelScreen() {
  const lookups = useLookups();
  const [view, setView] = useState<"arrivals" | "slots" | "departures">("arrivals");
  const [assignFor, setAssignFor] = useState<TravelRecord | null>(null);

  const travel = useAsync(() => getRepo().travel.records(), []);
  const slots = useAsync(() => getRepo().travel.slots(), []);

  const arrivals = useMemo(
    () => (travel.data ?? []).filter((t) => t.direction === "arrival"),
    [travel.data],
  );
  const departures = useMemo(
    () => (travel.data ?? []).filter((t) => t.direction === "departure"),
    [travel.data],
  );

  const slotLoad = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of travel.data ?? [])
      if (t.pickupSlotId) m.set(t.pickupSlotId, (m.get(t.pickupSlotId) ?? 0) + 1);
    return m;
  }, [travel.data]);

  const stats = useMemo(
    () => ({
      arriving: arrivals.length,
      needPickup: arrivals.filter((t) => t.needsPickup).length,
      unassigned: arrivals.filter((t) => t.needsPickup && !t.pickupSlotId).length,
      departing: departures.length,
    }),
    [arrivals, departures],
  );

  const cols: Column<TravelRecord>[] = [
    {
      key: "who",
      header: "Participant",
      sortValue: (t) => lookups.participant(t.participantId)?.fullName ?? "",
      cell: (t) => {
        const p = lookups.participant(t.participantId);
        return (
          <div className="flex min-w-0 items-center gap-2.5">
            <NeoAvatar name={p?.fullName ?? "?"} size={28} />
            <div className="min-w-0">
              <div className="truncate font-medium text-ink">{p?.fullName ?? "Unknown"}</div>
              <div className="truncate text-[0.72rem] text-ink-muted">
                {lookups.college(p?.collegeId ?? "")?.shortName}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      key: "mode",
      header: "Mode",
      width: "128px",
      sortValue: (t) => t.mode,
      cell: (t) => {
        const Icon = MODE_ICON[t.mode];
        return (
          <span className="inline-flex items-center gap-1.5 text-[0.78rem] text-ink-soft">
            <Icon className="size-3.5 shrink-0 text-ink-faint" />
            {titleCase(t.mode)}
            {t.serviceRef ? (
              <span className="font-mono text-[0.7rem] text-ink-faint">{t.serviceRef}</span>
            ) : null}
          </span>
        );
      },
    },
    {
      key: "station",
      header: "Station",
      width: "160px",
      sortValue: (t) => t.station,
      cell: (t) => <span className="truncate text-[0.78rem] text-ink-soft">{t.station}</span>,
    },
    {
      key: "when",
      header: "Scheduled",
      width: "142px",
      sortValue: (t) => t.scheduledAt,
      cell: (t) => (
        <span className="text-[0.76rem] text-ink-muted">
          {new Date(t.scheduledAt).toLocaleString("en-IN", {
            day: "numeric",
            month: "short",
            hour: "numeric",
            minute: "2-digit",
          })}
        </span>
      ),
    },
    {
      key: "pickup",
      header: "Pickup",
      width: "168px",
      cell: (t) => {
        if (!t.needsPickup)
          return <span className="text-[0.75rem] text-ink-faint">Own transport</span>;
        const slot = (slots.data ?? []).find((s) => s.id === t.pickupSlotId);
        if (!slot)
          return (
            <NeoButton size="sm" variant="secondary" onClick={() => setAssignFor(t)}>
              Assign slot
            </NeoButton>
          );
        return (
          <span className="truncate text-[0.75rem] text-ink-soft">
            {slot.vehicle.split(" ")[0]} ·{" "}
            {new Date(slot.windowStart).toLocaleTimeString("en-IN", {
              hour: "numeric",
              minute: "2-digit",
            })}
          </span>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      width: "110px",
      sortValue: (t) => t.status,
      cell: (t) => (
        <StatusBadge tone={TRAVEL_TONE[t.status]} size="sm">
          {titleCase(t.status)}
        </StatusBadge>
      ),
    },
  ];

  const rows = view === "departures" ? departures : arrivals;

  return (
    <Page>
      <PageHeader
        title="Travel & arrivals"
        description="Out-station contingents land at odd hours. Group them into pickup slots with a vehicle and a volunteer, or somebody is stranded at a station at 3am."
        actions={
          <NeoButton
            size="sm"
            variant="secondary"
            icon={<Download />}
            onClick={() =>
              downloadCsv(`${view}-manifest.csv`, [
                ["Participant", "Code", "College", "Direction", "Mode", "Service", "Station", "Scheduled", "Needs pickup", "Slot", "Status"],
                ...rows.map((t) => {
                  const p = lookups.participant(t.participantId);
                  const slot = (slots.data ?? []).find((s) => s.id === t.pickupSlotId);
                  return [
                    p?.fullName ?? "", p?.code ?? "",
                    lookups.college(p?.collegeId ?? "")?.name ?? "",
                    t.direction, t.mode, t.serviceRef ?? "", t.station, t.scheduledAt,
                    t.needsPickup ? "yes" : "no", slot?.vehicle ?? "", t.status,
                  ];
                }),
              ])
            }
          >
            Export manifest
          </NeoButton>
        }
      />

      <StatGrid cols={4}>
        <NeoStatTile label="Arriving" value={stats.arriving.toLocaleString("en-IN")} icon={<Plane />} />
        <NeoStatTile label="Need a pickup" value={stats.needPickup.toLocaleString("en-IN")} icon={<Truck />} />
        <NeoStatTile
          label="Unassigned pickups"
          value={stats.unassigned.toLocaleString("en-IN")}
          icon={<Clock />}
          deltaLabel="No vehicle yet"
        />
        <NeoStatTile label="Departing" value={stats.departing.toLocaleString("en-IN")} icon={<Bus />} />
      </StatGrid>

      <NeoSegmented
        value={view}
        onChange={setView}
        options={[
          { value: "arrivals", label: `Arrivals (${stats.arriving})` },
          { value: "slots", label: `Pickup slots (${slots.data?.length ?? 0})` },
          { value: "departures", label: `Departures (${stats.departing})` },
        ]}
      />

      {view === "slots" ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(slots.data ?? []).map((s) => {
            const load = slotLoad.get(s.id) ?? 0;
            const full = load >= s.capacity;
            return (
              <NeoCard key={s.id}>
                <NeoCard.Header
                  eyebrow={s.station}
                  title={s.vehicle}
                  subtitle={`${new Date(s.windowStart).toLocaleString("en-IN", {
                    day: "numeric",
                    month: "short",
                    hour: "numeric",
                    minute: "2-digit",
                  })} – ${new Date(s.windowEnd).toLocaleTimeString("en-IN", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}`}
                  actions={
                    <StatusBadge
                      size="sm"
                      tone={
                        s.status === "completed"
                          ? "neutral"
                          : s.status === "dispatched"
                            ? "info"
                            : "pending"
                      }
                    >
                      {titleCase(s.status)}
                    </StatusBadge>
                  }
                />
                <NeoCard.Body>
                  <NeoProgress
                    value={load}
                    max={s.capacity}
                    tone={full ? "failed" : "paid"}
                    label={`${load} of ${s.capacity} seats`}
                    showValue
                  />
                  <dl className="mt-3 divide-y divide-hairline">
                    <KeyValue label="Driver" value={s.driverName} />
                    <KeyValue label="Driver phone" value={s.driverPhone} mono />
                    <KeyValue
                      label="Volunteer"
                      value={lookups.staffMember(s.volunteerStaffId)?.name ?? "Unassigned"}
                    />
                  </dl>
                  {s.status === "planned" ? (
                    <NeoButton
                      block
                      size="sm"
                      variant="primary"
                      className="mt-3"
                      onClick={async () => {
                        await getRepo().travel.setSlotStatus(s.id, "dispatched");
                        toast.success("Vehicle dispatched", `${s.vehicle} is on its way.`);
                        slots.reload();
                      }}
                    >
                      Dispatch
                    </NeoButton>
                  ) : s.status === "dispatched" ? (
                    <NeoButton
                      block
                      size="sm"
                      variant="secondary"
                      className="mt-3"
                      onClick={async () => {
                        await getRepo().travel.setSlotStatus(s.id, "completed");
                        toast.success("Run complete");
                        slots.reload();
                      }}
                    >
                      Mark complete
                    </NeoButton>
                  ) : null}
                </NeoCard.Body>
              </NeoCard>
            );
          })}
        </div>
      ) : (
        <NeoCard>
          <NeoCard.Body flush>
            {travel.loading ? (
              <div className="p-4">
                <NeoSkeleton className="h-48" />
              </div>
            ) : (
              <DataTable
                rows={rows}
                columns={cols}
                rowKey={(t) => t.id}
                sort={{ key: "when", dir: "asc" }}
                pageSize={25}
                empty={<EmptyState icon={<Plane />} title="No travel records" />}
              />
            )}
          </NeoCard.Body>
        </NeoCard>
      )}

      <NeoModal
        open={!!assignFor}
        onOpenChange={(v) => !v && setAssignFor(null)}
        title="Assign a pickup slot"
        description="Slots at the same station within a couple of hours of the arrival are listed first. A slot at capacity is refused."
        size="lg"
      >
        {assignFor ? (
          <div className="space-y-3">
            <div className="neo-inset-sm rounded-neo p-3">
              <dl className="divide-y divide-hairline">
                <KeyValue
                  label="Participant"
                  value={lookups.participant(assignFor.participantId)?.fullName ?? "—"}
                />
                <KeyValue label="Station" value={assignFor.station} />
                <KeyValue
                  label="Arrives"
                  value={new Date(assignFor.scheduledAt).toLocaleString("en-IN")}
                />
              </dl>
            </div>
            <p className="engraved">Available slots</p>
            <ul className="space-y-1.5">
              {(slots.data ?? [])
                .filter((s) => s.status !== "completed")
                .sort((a, b) => {
                  const same = (s: PickupSlot) => (s.station === assignFor.station ? 0 : 1);
                  return same(a) - same(b) || (a.windowStart < b.windowStart ? -1 : 1);
                })
                .slice(0, 10)
                .map((s) => {
                  const load = slotLoad.get(s.id) ?? 0;
                  const full = load >= s.capacity;
                  return (
                    <li key={s.id}>
                      <button
                        disabled={full}
                        onClick={async () => {
                          const t = assignFor;
                          setAssignFor(null);
                          try {
                            await getRepo().travel.assignToSlot(t.id, s.id);
                            toast.success("Assigned to pickup", `${s.vehicle} · ${s.station}`);
                            travel.reload();
                          } catch (e) {
                            toast.error(isDataError(e) ? e.message : "Assignment failed");
                          }
                        }}
                        className="flex w-full items-center gap-3 rounded-neo bg-plane-alt px-3 py-2.5 text-left transition-colors hover:bg-plane disabled:opacity-40"
                      >
                        <MapPin className="size-4 shrink-0 text-ink-faint" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[0.84rem] font-medium text-ink">
                            {s.vehicle}
                          </span>
                          <span className="block truncate text-[0.73rem] text-ink-muted">
                            {s.station} ·{" "}
                            {new Date(s.windowStart).toLocaleString("en-IN", {
                              day: "numeric",
                              month: "short",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </span>
                        </span>
                        <StatusBadge
                          tone={full ? "failed" : "paid"}
                          size="sm"
                          dot={false}
                        >
                          <Users className="mr-1 inline size-3" />
                          {load}/{s.capacity}
                        </StatusBadge>
                      </button>
                    </li>
                  );
                })}
            </ul>
          </div>
        ) : null}
      </NeoModal>
    </Page>
  );
}
