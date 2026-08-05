"use client";

import { useMemo, useState } from "react";
import {
  BedDouble,
  Wand2,
  LogIn,
  LogOut,
  KeyRound,
  Utensils,
  AlertTriangle,
  Download,
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
  NeoCheckbox,
  KeyValue,
  NeoSkeleton,
  toast,
  type Column,
} from "@/frontend/components/neo";
import { useAsync } from "@/frontend/hooks/use-async";
import { useLookups } from "@/frontend/hooks/use-lookups";
import { getRepo } from "@/lib/data";
import { isDataError, type AccommodationRequest, type RoomAllotment } from "@/lib/data/types";
import { FEST, HOSTEL_BLOCKS, MEALS, inr } from "@/lib/fest.config";
import { ACCOMMODATION_TONE, titleCase } from "@/frontend/status";
import { downloadCsv, relativeTime } from "@/lib/utils";

/**
 * Accommodation.
 *
 * The allotment call refuses on four separate grounds — unpaid dues, missing
 * hostel documents, a gender/block mismatch, and a full room. Each one exists
 * because it is a real problem the hostel desk hits at 11pm on arrival night,
 * and the UI surfaces the specific refusal rather than a generic failure.
 */
export function AccommodationScreen() {
  const lookups = useLookups();
  const [view, setView] = useState<"requests" | "occupancy" | "checkin">("requests");
  const [busy, setBusy] = useState(false);
  const [checkInFor, setCheckInFor] = useState<RoomAllotment | null>(null);
  const [keyIssued, setKeyIssued] = useState(true);
  const [beddingIssued, setBeddingIssued] = useState(true);

  const requests = useAsync(() => getRepo().accommodation.requests(), []);
  const allotments = useAsync(() => getRepo().accommodation.allotments(), []);
  const occupancy = useAsync(() => getRepo().accommodation.occupancy(), []);

  const allotByRequest = useMemo(
    () => new Map((allotments.data ?? []).map((a) => [a.requestId, a])),
    [allotments.data],
  );

  const stats = useMemo(() => {
    const r = requests.data ?? [];
    const o = occupancy.data ?? [];
    return {
      requested: r.filter((x) => x.status === "requested").length,
      allotted: r.filter((x) => x.status === "allotted").length,
      checkedIn: r.filter((x) => x.status === "checked_in").length,
      capacity: o.reduce((s, b) => s + b.capacity, 0),
      occupied: o.reduce((s, b) => s + b.occupied, 0),
      revenue: r.filter((x) => x.status !== "cancelled").reduce((s, x) => s + x.amount, 0),
    };
  }, [requests.data, occupancy.data]);

  const autoAllot = async () => {
    const pending = (requests.data ?? []).filter((r) => r.status === "requested").map((r) => r.id);
    if (!pending.length) return;
    setBusy(true);
    try {
      const res = await getRepo().accommodation.autoAllot(pending);
      if (res.allotted)
        toast.success(
          `Allotted ${res.allotted} beds`,
          res.failed.length ? `${res.failed.length} could not be placed.` : undefined,
        );
      if (res.failed.length && !res.allotted)
        toast.warning(
          "Nothing could be allotted",
          `Most common reason: ${res.failed[0].reason}`,
        );
      requests.reload();
      allotments.reload();
      occupancy.reload();
    } finally {
      setBusy(false);
    }
  };

  const requestCols: Column<AccommodationRequest>[] = [
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
              <div className="truncate font-medium text-ink">{p?.fullName ?? "Unknown"}</div>
              <div className="truncate text-[0.72rem] text-ink-muted">
                {lookups.college(p?.collegeId ?? "")?.shortName} · {titleCase(r.gender)}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      key: "nights",
      header: "Nights",
      width: "128px",
      sortValue: (r) => r.nights.length,
      cell: (r) => (
        <div className="flex gap-1">
          {FEST.days.map((d) => (
            <span
              key={d.key}
              className={`grid size-6 place-items-center rounded-[5px] text-[0.62rem] font-bold ${
                r.nights.includes(d.key)
                  ? "bg-waitlist-bg text-waitlist"
                  : "bg-neutral-bg text-ink-faint"
              }`}
              title={d.label}
            >
              {d.key.toUpperCase()}
            </span>
          ))}
        </div>
      ),
    },
    {
      key: "bed",
      header: "Bed",
      width: "148px",
      cell: (r) => {
        const a = allotByRequest.get(r.id);
        if (!a) return <span className="text-[0.76rem] text-ink-faint">Not allotted</span>;
        const block = HOSTEL_BLOCKS.find((b) => b.id === a.blockId);
        return (
          <span className="text-[0.76rem] text-ink-soft">
            {block?.name} · {a.roomNo}/{a.bedNo}
          </span>
        );
      },
    },
    {
      key: "needs",
      header: "Special needs",
      hideBelow: "lg",
      cell: (r) =>
        r.specialNeeds ? (
          <span className="text-[0.75rem] text-pending">{r.specialNeeds}</span>
        ) : (
          <span className="text-ink-faint">—</span>
        ),
    },
    {
      key: "amount",
      header: "Fee",
      width: "88px",
      align: "right",
      sortValue: (r) => r.amount,
      cell: (r) => <span className="tnum text-ink-soft">{inr(r.amount)}</span>,
    },
    {
      key: "status",
      header: "Status",
      width: "122px",
      sortValue: (r) => r.status,
      cell: (r) => (
        <StatusBadge tone={ACCOMMODATION_TONE[r.status]} size="sm">
          {titleCase(r.status)}
        </StatusBadge>
      ),
    },
    {
      key: "action",
      header: "",
      width: "112px",
      align: "right",
      cell: (r) => {
        const a = allotByRequest.get(r.id);
        if (r.status === "requested")
          return (
            <NeoButton
              size="sm"
              variant="secondary"
              onClick={async () => {
                try {
                  const res = await getRepo().accommodation.autoAllot([r.id]);
                  if (res.allotted) {
                    toast.success("Bed allotted");
                    requests.reload();
                    allotments.reload();
                    occupancy.reload();
                  } else {
                    toast.error("Cannot allot", res.failed[0]?.reason);
                  }
                } catch (e) {
                  toast.error(isDataError(e) ? e.message : "Allotment failed");
                }
              }}
            >
              Allot
            </NeoButton>
          );
        if (a && !a.checkedInAt)
          return (
            <NeoButton size="sm" variant="primary" onClick={() => setCheckInFor(a)}>
              Check in
            </NeoButton>
          );
        return null;
      },
    },
  ];

  const checkinRows = (allotments.data ?? []).filter((a) => !a.checkedOutAt);

  return (
    <Page>
      <PageHeader
        title="Accommodation"
        description={`${stats.capacity} beds across ${HOSTEL_BLOCKS.length} blocks, gender-segregated. Allotment is refused for unpaid dues, missing ID proof, a gender mismatch, or a full room — all enforced in the data layer.`}
        actions={
          <>
            <NeoButton
              size="sm"
              variant="secondary"
              icon={<Download />}
              onClick={() =>
                downloadCsv("accommodation.csv", [
                  ["Participant", "Code", "College", "Gender", "Nights", "Status", "Block", "Room", "Bed", "Fee"],
                  ...(requests.data ?? []).map((r) => {
                    const p = lookups.participant(r.participantId);
                    const a = allotByRequest.get(r.id);
                    return [
                      p?.fullName ?? "", p?.code ?? "",
                      lookups.college(p?.collegeId ?? "")?.name ?? "",
                      r.gender, r.nights.join("|"), r.status,
                      HOSTEL_BLOCKS.find((b) => b.id === a?.blockId)?.name ?? "",
                      a?.roomNo ?? "", a?.bedNo ?? "", r.amount,
                    ];
                  }),
                ])
              }
            >
              Export
            </NeoButton>
            <NeoButton
              size="sm"
              variant="primary"
              icon={<Wand2 />}
              loading={busy}
              onClick={autoAllot}
            >
              Auto-allot {stats.requested}
            </NeoButton>
          </>
        }
      />

      <StatGrid cols={4}>
        <NeoStatTile
          label="Awaiting allotment"
          value={stats.requested.toLocaleString("en-IN")}
          icon={<AlertTriangle />}
          deltaLabel="Allot before arrival day"
        />
        <NeoStatTile label="Allotted" value={stats.allotted.toLocaleString("en-IN")} icon={<BedDouble />} />
        <NeoStatTile label="Checked in" value={stats.checkedIn.toLocaleString("en-IN")} icon={<LogIn />} />
        <NeoStatTile
          label="Occupancy"
          value={`${stats.occupied}/${stats.capacity}`}
          deltaLabel={`${inr(stats.revenue, { compact: true })} in hostel fees`}
        />
      </StatGrid>

      <NeoSegmented
        value={view}
        onChange={setView}
        options={[
          { value: "requests", label: "Requests" },
          { value: "occupancy", label: "Block occupancy" },
          { value: "checkin", label: "Hostel check-in" },
        ]}
      />

      {view === "occupancy" ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(occupancy.data ?? []).map((b) => {
            const full = b.occupied >= b.capacity;
            return (
              <NeoCard key={b.blockId}>
                <NeoCard.Header
                  eyebrow={`${titleCase(b.gender)} block`}
                  title={b.name}
                  actions={
                    <StatusBadge tone={full ? "failed" : b.occupied / b.capacity > 0.85 ? "pending" : "paid"} size="sm">
                      {full ? "Full" : `${b.capacity - b.occupied} free`}
                    </StatusBadge>
                  }
                />
                <NeoCard.Raw>
                  <NeoProgress
                    value={b.occupied}
                    max={b.capacity}
                    tone={full ? "failed" : "paid"}
                    label={`${b.occupied} of ${b.capacity} beds`}
                    showValue
                  />
                </NeoCard.Raw>
              </NeoCard>
            );
          })}
        </div>
      ) : null}

      {view === "requests" ? (
        <NeoCard>
          <NeoCard.Body flush>
            {requests.loading ? (
              <div className="p-4">
                <NeoSkeleton className="h-48" />
              </div>
            ) : (
              <DataTable
                rows={requests.data ?? []}
                columns={requestCols}
                rowKey={(r) => r.id}
                sort={{ key: "status", dir: "asc" }}
                pageSize={25}
                empty={<EmptyState icon={<BedDouble />} title="No accommodation requests" />}
              />
            )}
          </NeoCard.Body>
        </NeoCard>
      ) : null}

      {view === "checkin" ? (
        <NeoCard>
          <NeoCard.Header
            eyebrow="Hostel desk"
            title="Check-in / check-out"
            subtitle="Key and bedding are issued at check-in and returned at check-out. Unreturned items are a real cost."
            icon={<KeyRound />}
          />
          <NeoCard.Body flush>
            {!checkinRows.length ? (
              <EmptyState title="Nobody to check in" />
            ) : (
              <ul className="divide-y divide-hairline">
                {checkinRows.slice(0, 200).map((a) => {
                  const p = lookups.participant(a.participantId);
                  const block = HOSTEL_BLOCKS.find((b) => b.id === a.blockId);
                  return (
                    <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                      <NeoAvatar name={p?.fullName ?? "?"} size={30} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.85rem] font-medium text-ink">
                          {p?.fullName ?? "Unknown"}
                        </span>
                        <span className="block truncate text-[0.74rem] text-ink-muted">
                          {block?.name} · Room {a.roomNo}, bed {a.bedNo}
                        </span>
                      </span>
                      {a.checkedInAt ? (
                        <>
                          <div className="flex gap-1">
                            {a.keyIssued ? (
                              <StatusBadge tone="info" size="sm" dot={false}>
                                Key
                              </StatusBadge>
                            ) : null}
                            {a.beddingIssued ? (
                              <StatusBadge tone="info" size="sm" dot={false}>
                                Bedding
                              </StatusBadge>
                            ) : null}
                          </div>
                          <NeoButton
                            size="sm"
                            variant="secondary"
                            icon={<LogOut />}
                            onClick={async () => {
                              await getRepo().accommodation.checkOut(a.id, true);
                              toast.success("Checked out", "Key and bedding marked returned.");
                              allotments.reload();
                              requests.reload();
                            }}
                          >
                            Check out
                          </NeoButton>
                        </>
                      ) : (
                        <NeoButton
                          size="sm"
                          variant="primary"
                          icon={<LogIn />}
                          onClick={() => setCheckInFor(a)}
                        >
                          Check in
                        </NeoButton>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </NeoCard.Body>
        </NeoCard>
      ) : null}

      <NeoModal
        open={!!checkInFor}
        onOpenChange={(v) => !v && setCheckInFor(null)}
        title="Hostel check-in"
        description="Record what you physically hand over. These come back at check-out."
        footer={
          <>
            <NeoButton variant="ghost" onClick={() => setCheckInFor(null)}>
              Cancel
            </NeoButton>
            <NeoButton
              variant="primary"
              icon={<LogIn />}
              onClick={async () => {
                if (!checkInFor) return;
                const a = checkInFor;
                setCheckInFor(null);
                try {
                  await getRepo().accommodation.checkIn(a.id, { keyIssued, beddingIssued });
                  const days = (requests.data ?? []).find((r) => r.id === a.requestId)?.nights ?? [];
                  await getRepo().accommodation.issueMealCoupons(a.participantId, days);
                  toast.success(
                    "Checked in",
                    `${days.length * MEALS.length} meal coupons issued.`,
                  );
                  allotments.reload();
                  requests.reload();
                } catch (e) {
                  toast.error(isDataError(e) ? e.message : "Check-in failed");
                }
              }}
            >
              Check in & issue coupons
            </NeoButton>
          </>
        }
      >
        {checkInFor ? (
          <div className="space-y-3">
            <dl className="divide-y divide-hairline">
              <KeyValue
                label="Participant"
                value={lookups.participant(checkInFor.participantId)?.fullName ?? "—"}
              />
              <KeyValue
                label="Block"
                value={HOSTEL_BLOCKS.find((b) => b.id === checkInFor.blockId)?.name ?? "—"}
              />
              <KeyValue label="Room / bed" value={`${checkInFor.roomNo} / ${checkInFor.bedNo}`} />
              <KeyValue label="Allotted" value={relativeTime(checkInFor.allottedAt)} />
            </dl>
            <div className="space-y-2 rounded-neo bg-plane-alt p-3">
              <NeoCheckbox checked={keyIssued} onChange={setKeyIssued} label="Room key issued" />
              <NeoCheckbox
                checked={beddingIssued}
                onChange={setBeddingIssued}
                label="Mattress & bedding issued"
              />
            </div>
            <p className="flex items-start gap-2 text-[0.78rem] leading-snug text-ink-muted">
              <Utensils className="mt-0.5 size-3.5 shrink-0" />
              Meal coupons for every booked night are issued automatically on check-in.
            </p>
          </div>
        ) : null}
      </NeoModal>
    </Page>
  );
}
