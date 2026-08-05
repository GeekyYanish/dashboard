"use client";

import { useMemo, useState } from "react";
import {
  Building2,
  BadgeCheck,
  Download,
  UsersRound,
  Lock,
  Unlock,
  AlertTriangle,
  CalendarDays,
  Phone,
  ArrowLeftRight,
} from "lucide-react";
import { Page, PageHeader, StatGrid } from "@/frontend/components/page";
import {
  NeoCard,
  NeoButton,
  DataTable,
  StatusBadge,
  NeoAvatar,
  NeoStatTile,
  EmptyState,
  NeoSkeleton,
  NeoProgress,
  KeyValue,
  NeoDrawer,
  NeoSegmented,
  SectionRule,
  toast,
  type Column,
} from "@/frontend/components/neo";
import { HeatmapGrid } from "@/frontend/components/charts";
import { FilterBar } from "@/frontend/components/filter-bar";
import { useAsync, useDebounced } from "@/frontend/hooks/use-async";
import { useLookups } from "@/frontend/hooks/use-lookups";
import { getRepo } from "@/lib/data";
import { isDataError, type FestEvent, type Team } from "@/lib/data/types";
import { TRACKS, inr } from "@/lib/fest.config";
import { EVENT_TONE, titleCase } from "@/frontend/status";
import { downloadCsv, relativeTime } from "@/lib/utils";

/* ==========================================================================
   Colleges — the contingent view. A national fest is negotiated with
   institutions, not individuals, so this is the level the team actually works.
   ========================================================================== */

export function CollegesScreen() {
  const contingents = useAsync(() => getRepo().colleges.contingents(), []);
  const [search, setSearch] = useState("");
  const dSearch = useDebounced(search, 200);
  const [openId, setOpenId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const d = contingents.data ?? [];
    if (!dSearch) return d;
    const q = dSearch.toLowerCase();
    return d.filter(
      (c) =>
        c.college.name.toLowerCase().includes(q) ||
        c.college.shortName.toLowerCase().includes(q) ||
        c.college.city.toLowerCase().includes(q),
    );
  }, [contingents.data, dSearch]);

  const totals = useMemo(() => {
    const d = contingents.data ?? [];
    return {
      colleges: d.length,
      people: d.reduce((s, c) => s + c.participants, 0),
      paid: d.reduce((s, c) => s + c.paid, 0),
      due: d.reduce((s, c) => s + c.due, 0),
      unverified: d.filter((c) => !c.college.isVerified).length,
    };
  }, [contingents.data]);

  type Row = (typeof rows)[number];

  const columns: Column<Row>[] = [
    {
      key: "college",
      header: "Institution",
      sortValue: (r) => r.college.name,
      cell: (r) => (
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-medium text-ink">{r.college.shortName}</span>
            {r.college.isVerified ? (
              <BadgeCheck className="size-3.5 shrink-0 text-paid" aria-label="Verified" />
            ) : null}
          </div>
          <div className="truncate text-[0.72rem] text-ink-muted">
            {r.college.city}, {r.college.state}
          </div>
        </div>
      ),
    },
    {
      key: "people",
      header: "Contingent",
      width: "96px",
      align: "right",
      sortValue: (r) => r.participants,
      cell: (r) => (
        <div>
          <span className="tnum font-semibold text-ink">{r.participants}</span>
          <span className="tnum block text-[0.7rem] text-ink-faint">{r.confirmed} confirmed</span>
        </div>
      ),
    },
    {
      key: "paid",
      header: "Paid",
      width: "104px",
      align: "right",
      sortValue: (r) => r.paid,
      cell: (r) => <span className="tnum text-paid">{inr(r.paid, { compact: true })}</span>,
    },
    {
      key: "due",
      header: "Due",
      width: "104px",
      align: "right",
      sortValue: (r) => r.due,
      cell: (r) =>
        r.due > 0 ? (
          <span className="tnum font-semibold text-failed">{inr(r.due, { compact: true })}</span>
        ) : (
          <StatusBadge tone="paid" size="sm" dot={false}>
            Settled
          </StatusBadge>
        ),
    },
    {
      key: "acc",
      header: "Beds",
      width: "72px",
      align: "right",
      hideBelow: "md",
      sortValue: (r) => r.accommodation,
      cell: (r) => <span className="tnum text-ink-muted">{r.accommodation}</span>,
    },
    {
      key: "arrival",
      header: "Arrives",
      width: "116px",
      hideBelow: "lg",
      sortValue: (r) => r.arrivalAt ?? "9999",
      cell: (r) =>
        r.arrivalAt ? (
          <span className="text-[0.75rem] text-ink-muted">
            {new Date(r.arrivalAt).toLocaleString("en-IN", {
              day: "numeric",
              month: "short",
              hour: "numeric",
              minute: "2-digit",
            })}
          </span>
        ) : (
          <span className="text-ink-faint">—</span>
        ),
    },
  ];

  const focused = openId ? (contingents.data ?? []).find((c) => c.college.id === openId) : null;

  return (
    <Page>
      <PageHeader
        title="Colleges & contingents"
        description="One row per institution. Contingent leads and faculty escorts are the people the desk actually calls when something goes wrong."
        actions={
          <NeoButton
            size="sm"
            variant="secondary"
            icon={<Download />}
            onClick={() =>
              downloadCsv("contingents.csv", [
                ["College", "Short", "City", "State", "Verified", "Participants", "Confirmed", "Paid", "Due", "Beds", "Lead", "Lead phone", "Faculty escort"],
                ...rows.map((r) => [
                  r.college.name, r.college.shortName, r.college.city, r.college.state,
                  r.college.isVerified ? "yes" : "no", r.participants, r.confirmed,
                  r.paid, r.due, r.accommodation, r.college.contactName,
                  r.college.contactPhone, r.college.facultyEscortName ?? "",
                ]),
              ])
            }
          >
            Export
          </NeoButton>
        }
      />

      <StatGrid cols={4}>
        <NeoStatTile label="Colleges" value={totals.colleges} icon={<Building2 />} />
        <NeoStatTile label="Participants" value={totals.people.toLocaleString("en-IN")} />
        <NeoStatTile label="Collected" value={inr(totals.paid, { compact: true })} />
        <NeoStatTile
          label="Unverified institutions"
          value={totals.unverified}
          icon={<AlertTriangle />}
          deltaLabel="Nomination letter not checked"
        />
      </StatGrid>

      <FilterBar
        search={search}
        onSearch={setSearch}
        searchPlaceholder="College name, short name or city…"
        facets={[]}
        onFacetChange={() => {}}
        onClearAll={() => setSearch("")}
        resultCount={rows.length}
        totalCount={contingents.data?.length}
      />

      <NeoCard>
        <NeoCard.Body flush>
          <DataTable
            rows={rows}
            columns={columns}
            rowKey={(r) => r.college.id}
            loading={contingents.loading}
            onRowClick={(r) => setOpenId(r.college.id)}
            sort={{ key: "people", dir: "desc" }}
            pageSize={25}
            empty={<EmptyState icon={<Building2 />} title="No colleges match" />}
          />
        </NeoCard.Body>
      </NeoCard>

      <NeoDrawer
        open={!!focused}
        onOpenChange={(v) => !v && setOpenId(null)}
        eyebrow={focused?.college.city}
        title={focused?.college.name ?? ""}
        footer={
          focused ? (
            <NeoButton
              size="sm"
              variant={focused.college.isVerified ? "secondary" : "primary"}
              icon={<BadgeCheck />}
              onClick={async () => {
                await getRepo().colleges.setVerified(
                  focused.college.id,
                  !focused.college.isVerified,
                );
                toast.success(
                  focused.college.isVerified ? "Verification removed" : "Institution verified",
                );
                contingents.reload();
              }}
            >
              {focused.college.isVerified ? "Remove verification" : "Mark verified"}
            </NeoButton>
          ) : null
        }
      >
        {focused ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <MiniStat label="People" value={String(focused.participants)} />
              <MiniStat label="Paid" value={inr(focused.paid, { compact: true })} />
              <MiniStat
                label="Due"
                value={inr(focused.due, { compact: true })}
                bad={focused.due > 0}
              />
            </div>

            <div>
              <SectionRule label="Contingent lead" className="mb-2" />
              <dl className="divide-y divide-hairline">
                <KeyValue label="Name" value={focused.college.contactName} />
                <KeyValue label="Phone" value={focused.college.contactPhone} mono />
                <KeyValue label="Email" value={focused.college.contactEmail} />
              </dl>
            </div>

            <div>
              <SectionRule label="Faculty escort" className="mb-2" />
              {focused.college.facultyEscortName ? (
                <dl className="divide-y divide-hairline">
                  <KeyValue label="Name" value={focused.college.facultyEscortName} />
                  <KeyValue label="Phone" value={focused.college.facultyEscortPhone ?? "—"} mono />
                </dl>
              ) : (
                <div className="rounded-neo bg-pending-bg p-3 text-[0.8rem] leading-snug text-ink-soft">
                  <span className="font-semibold text-ink">No faculty escort registered.</span>{" "}
                  Mandatory if this contingent includes anyone under 18.
                </div>
              )}
            </div>

            <div>
              <SectionRule label="Logistics" className="mb-2" />
              <dl className="divide-y divide-hairline">
                <KeyValue label="Confirmed registrations" value={String(focused.confirmed)} />
                <KeyValue label="Beds allotted" value={String(focused.accommodation)} />
                <KeyValue
                  label="First arrival"
                  value={
                    focused.arrivalAt
                      ? new Date(focused.arrivalAt).toLocaleString("en-IN")
                      : "Not submitted"
                  }
                />
              </dl>
            </div>

            <NeoButton
              block
              variant="secondary"
              icon={<Phone />}
              onClick={() =>
                toast.info(
                  "Audience staged",
                  `${focused.participants} participants from ${focused.college.shortName} queued in Communications.`,
                )
              }
            >
              Message this contingent
            </NeoButton>
          </div>
        ) : null}
      </NeoDrawer>
    </Page>
  );
}

/* ==========================================================================
   Teams
   ========================================================================== */

export function TeamsScreen() {
  const lookups = useLookups();
  const [view, setView] = useState<"all" | "incomplete" | "subs">("all");
  const teams = useAsync(() => getRepo().teams.list(), []);
  const incomplete = useAsync(() => getRepo().teams.incomplete(), []);
  const subs = useAsync(() => getRepo().teams.substitutions(), []);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const columns: Column<Team>[] = [
    {
      key: "name",
      header: "Team",
      sortValue: (t) => t.name,
      cell: (t) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-ink">{t.name}</div>
          <div className="truncate font-mono text-[0.72rem] text-ink-muted">{t.joinCode}</div>
        </div>
      ),
    },
    {
      key: "event",
      header: "Event",
      sortValue: (t) => lookups.event(t.eventId)?.title ?? "",
      cell: (t) => <span className="text-ink-soft">{lookups.event(t.eventId)?.title ?? "—"}</span>,
    },
    {
      key: "size",
      header: "Members",
      width: "116px",
      align: "right",
      sortValue: (t) => t.memberIds.length,
      cell: (t) => {
        const e = lookups.event(t.eventId);
        const short = e ? t.memberIds.length < e.minTeamSize : false;
        return (
          <span className={short ? "tnum font-semibold text-failed" : "tnum text-ink-soft"}>
            {t.memberIds.length}
            {e ? ` / ${e.minTeamSize}–${e.maxTeamSize}` : ""}
          </span>
        );
      },
    },
    {
      key: "locked",
      header: "Roster",
      width: "100px",
      sortValue: (t) => String(t.isLocked),
      cell: (t) => (
        <StatusBadge tone={t.isLocked ? "neutral" : "info"} size="sm" dot={false}>
          {t.isLocked ? "Locked" : "Open"}
        </StatusBadge>
      ),
    },
    {
      key: "created",
      header: "Created",
      width: "104px",
      hideBelow: "md",
      sortValue: (t) => t.createdAt,
      cell: (t) => <span className="text-[0.76rem] text-ink-muted">{relativeTime(t.createdAt)}</span>,
    },
  ];

  const focused = openId ? (teams.data ?? []).find((t) => t.id === openId) : null;
  const focusedEvent = focused ? lookups.event(focused.eventId) : undefined;

  return (
    <Page>
      <PageHeader
        title="Teams"
        description="Rosters, join codes and substitutions. A team below its event's minimum size cannot compete — those are surfaced first."
      />

      <StatGrid cols={3}>
        <NeoStatTile label="Teams" value={(teams.data?.length ?? 0).toLocaleString("en-IN")} icon={<UsersRound />} />
        <NeoStatTile
          label="Below minimum size"
          value={(incomplete.data?.length ?? 0).toLocaleString("en-IN")}
          icon={<AlertTriangle />}
          deltaLabel="Cannot compete as-is"
        />
        <NeoStatTile
          label="Substitution requests"
          value={(subs.data ?? []).filter((s) => s.status === "pending").length}
          icon={<ArrowLeftRight />}
          deltaLabel="Awaiting approval"
        />
      </StatGrid>

      <NeoSegmented
        value={view}
        onChange={setView}
        options={[
          { value: "all", label: "All teams" },
          { value: "incomplete", label: "Incomplete" },
          { value: "subs", label: "Substitutions" },
        ]}
      />

      {view === "all" ? (
        <NeoCard>
          <NeoCard.Body flush>
            <DataTable
              rows={teams.data ?? []}
              columns={columns}
              rowKey={(t) => t.id}
              loading={teams.loading || lookups.loading}
              onRowClick={(t) => setOpenId(t.id)}
              sort={{ key: "created", dir: "desc" }}
              pageSize={25}
              empty={<EmptyState icon={<UsersRound />} title="No teams yet" />}
            />
          </NeoCard.Body>
        </NeoCard>
      ) : null}

      {view === "incomplete" ? (
        <NeoCard>
          <NeoCard.Header
            eyebrow="Blocking"
            title="Teams below minimum size"
            subtitle="Each needs members added or a substitution before the roster locks."
          />
          <NeoCard.Body flush>
            {incomplete.loading ? (
              <div className="p-4">
                <NeoSkeleton className="h-32" />
              </div>
            ) : !incomplete.data?.length ? (
              <EmptyState title="Every team is viable" />
            ) : (
              <ul className="divide-y divide-hairline">
                {incomplete.data.map(({ team, event, short }) => (
                  <li key={team.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.85rem] font-medium text-ink">
                        {team.name}
                      </span>
                      <span className="block truncate text-[0.75rem] text-ink-muted">
                        {event.title} · has {team.memberIds.length}, needs {event.minTeamSize}
                      </span>
                    </span>
                    <StatusBadge tone="failed" size="sm">
                      {short} short
                    </StatusBadge>
                    <NeoButton size="sm" variant="ghost" onClick={() => setOpenId(team.id)}>
                      Open
                    </NeoButton>
                  </li>
                ))}
              </ul>
            )}
          </NeoCard.Body>
        </NeoCard>
      ) : null}

      {view === "subs" ? (
        <NeoCard>
          <NeoCard.Header
            eyebrow="Approval trail"
            title="Substitution requests"
            subtitle="Rosters change right up to the gate. Every swap is recorded with who approved it."
          />
          <NeoCard.Body flush>
            {!subs.data?.length ? (
              <EmptyState title="No substitution requests" />
            ) : (
              <ul className="divide-y divide-hairline">
                {subs.data.map((s) => {
                  const out = lookups.participant(s.outParticipantId);
                  const inn = lookups.participant(s.inParticipantId);
                  const team = (teams.data ?? []).find((t) => t.id === s.teamId);
                  return (
                    <li key={s.id} className="px-4 py-3">
                      <div className="mb-1.5 flex flex-wrap items-center gap-2">
                        <span className="text-[0.85rem] font-medium text-ink">
                          {team?.name ?? s.teamId}
                        </span>
                        <StatusBadge
                          size="sm"
                          tone={
                            s.status === "approved"
                              ? "paid"
                              : s.status === "rejected"
                                ? "failed"
                                : "pending"
                          }
                        >
                          {titleCase(s.status)}
                        </StatusBadge>
                        <span className="text-[0.72rem] text-ink-faint">
                          {relativeTime(s.requestedAt)}
                        </span>
                      </div>
                      <p className="mb-2 flex flex-wrap items-center gap-2 text-[0.8rem] text-ink-soft">
                        <span className="text-failed line-through">{out?.fullName ?? "—"}</span>
                        <ArrowLeftRight className="size-3.5 text-ink-faint" />
                        <span className="text-paid">{inn?.fullName ?? "—"}</span>
                      </p>
                      <p className="mb-2 text-[0.76rem] text-ink-muted">{s.reason}</p>
                      {s.status === "pending" ? (
                        <div className="flex gap-2">
                          <NeoButton
                            size="sm"
                            variant="primary"
                            loading={busy === s.id}
                            onClick={async () => {
                              setBusy(s.id);
                              try {
                                await getRepo().teams.reviewSubstitution(s.id, "approved");
                                toast.success("Substitution approved", "Roster updated.");
                                subs.reload();
                                teams.reload();
                              } catch (e) {
                                toast.error(isDataError(e) ? e.message : "Failed");
                              } finally {
                                setBusy(null);
                              }
                            }}
                          >
                            Approve
                          </NeoButton>
                          <NeoButton
                            size="sm"
                            variant="ghost"
                            loading={busy === s.id}
                            onClick={async () => {
                              setBusy(s.id);
                              try {
                                await getRepo().teams.reviewSubstitution(s.id, "rejected");
                                toast.success("Substitution rejected");
                                subs.reload();
                              } finally {
                                setBusy(null);
                              }
                            }}
                          >
                            Reject
                          </NeoButton>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </NeoCard.Body>
        </NeoCard>
      ) : null}

      <NeoDrawer
        open={!!focused}
        onOpenChange={(v) => !v && setOpenId(null)}
        eyebrow={focusedEvent?.title}
        title={focused?.name ?? ""}
        footer={
          focused ? (
            <NeoButton
              size="sm"
              variant="secondary"
              icon={focused.isLocked ? <Unlock /> : <Lock />}
              onClick={async () => {
                await getRepo().teams.setLocked(focused.id, !focused.isLocked);
                toast.success(focused.isLocked ? "Roster unlocked" : "Roster locked");
                teams.reload();
              }}
            >
              {focused.isLocked ? "Unlock roster" : "Lock roster"}
            </NeoButton>
          ) : null
        }
      >
        {focused ? (
          <div className="space-y-4">
            <dl className="divide-y divide-hairline">
              <KeyValue label="Join code" value={focused.joinCode} mono />
              <KeyValue label="Event" value={focusedEvent?.title ?? "—"} />
              <KeyValue
                label="Size"
                value={`${focused.memberIds.length} of ${focusedEvent?.minTeamSize}–${focusedEvent?.maxTeamSize}`}
              />
              <KeyValue label="Created" value={relativeTime(focused.createdAt)} />
            </dl>

            <div>
              <SectionRule label="Roster" className="mb-2" />
              <ul className="space-y-1.5">
                {focused.memberIds.map((mid) => {
                  const m = lookups.participant(mid);
                  const isLeader = mid === focused.leaderParticipantId;
                  return (
                    <li
                      key={mid}
                      className="flex items-center gap-2.5 rounded-neo-sm bg-plane-alt px-2.5 py-2"
                    >
                      <NeoAvatar name={m?.fullName ?? "?"} size={28} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.82rem] font-medium text-ink">
                          {m?.fullName ?? "Unknown"}
                        </span>
                        <span className="block truncate text-[0.72rem] text-ink-muted">
                          {lookups.college(m?.collegeId ?? "")?.shortName} · {m?.phone}
                        </span>
                      </span>
                      {isLeader ? (
                        <StatusBadge tone="signal" size="sm" dot={false}>
                          Leader
                        </StatusBadge>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        ) : null}
      </NeoDrawer>
    </Page>
  );
}

/* ==========================================================================
   Events
   ========================================================================== */

export function EventsScreen() {
  const events = useAsync(() => getRepo().events.list(), []);
  const stats = useAsync(() => getRepo().events.allStats(), []);
  const [track, setTrack] = useState<string>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const statMap = useMemo(
    () => new Map((stats.data ?? []).map((s) => [s.eventId, s])),
    [stats.data],
  );

  const rows = useMemo(() => {
    const d = events.data ?? [];
    return track === "all" ? d : d.filter((e) => e.track === track);
  }, [events.data, track]);

  const columns: Column<FestEvent>[] = [
    {
      key: "title",
      header: "Event",
      sortValue: (e) => e.title,
      cell: (e) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-ink">{e.title}</div>
          <div className="truncate text-[0.72rem] text-ink-muted">
            {TRACKS.find((t) => t.id === e.track)?.label} · {e.venue}
          </div>
        </div>
      ),
    },
    {
      key: "day",
      header: "Day",
      width: "78px",
      sortValue: (e) => e.startsAt,
      cell: (e) => (
        <span className="text-[0.76rem] text-ink-muted">
          {e.day.toUpperCase()} ·{" "}
          {new Date(e.startsAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
        </span>
      ),
    },
    {
      key: "team",
      header: "Format",
      width: "92px",
      cell: (e) => (
        <span className="text-[0.76rem] text-ink-muted">
          {e.maxTeamSize === 1 ? "Solo" : `Team ${e.minTeamSize}–${e.maxTeamSize}`}
        </span>
      ),
    },
    {
      key: "fill",
      header: "Fill",
      width: "168px",
      sortValue: (e) => {
        const s = statMap.get(e.id);
        if (!e.capacity || !s) return 0;
        return (s.confirmedCount + s.pendingCount) / e.capacity;
      },
      cell: (e) => {
        const s = statMap.get(e.id);
        const filled = (s?.confirmedCount ?? 0) + (s?.pendingCount ?? 0);
        if (!e.capacity) return <span className="text-[0.75rem] text-ink-faint">Unlimited</span>;
        const over = filled > e.capacity;
        return (
          <div className="min-w-0">
            <NeoProgress
              value={Math.min(filled, e.capacity)}
              max={e.capacity}
              tone={over ? "failed" : filled / e.capacity > 0.85 ? "pending" : "paid"}
              size="sm"
            />
            <span className={`tnum mt-1 block text-[0.7rem] ${over ? "text-failed" : "text-ink-faint"}`}>
              {filled} / {e.capacity}
              {over ? " — over capacity" : ""}
            </span>
          </div>
        );
      },
    },
    {
      key: "waitlist",
      header: "Waitlist",
      width: "82px",
      align: "right",
      hideBelow: "md",
      sortValue: (e) => statMap.get(e.id)?.waitlistCount ?? 0,
      cell: (e) => {
        const n = statMap.get(e.id)?.waitlistCount ?? 0;
        return n ? (
          <StatusBadge tone="waitlist" size="sm" dot={false}>
            {n}
          </StatusBadge>
        ) : (
          <span className="text-ink-faint">—</span>
        );
      },
    },
    {
      key: "fee",
      header: "Fee",
      width: "80px",
      align: "right",
      sortValue: (e) => e.feeInr,
      cell: (e) => <span className="tnum text-ink-soft">{inr(e.feeInr)}</span>,
    },
    {
      key: "status",
      header: "Status",
      width: "132px",
      sortValue: (e) => e.status,
      cell: (e) => (
        <StatusBadge tone={EVENT_TONE[e.status]} size="sm">
          {titleCase(e.status)}
        </StatusBadge>
      ),
    },
  ];

  const focused = openId ? (events.data ?? []).find((e) => e.id === openId) : null;
  const focusedStats = openId ? statMap.get(openId) : undefined;

  const heat = useMemo(
    () =>
      rows
        .filter((e) => e.capacity != null && e.status !== "cancelled")
        .map((e) => {
          const s = statMap.get(e.id);
          const filled = (s?.confirmedCount ?? 0) + (s?.pendingCount ?? 0);
          return {
            id: e.id,
            label: e.title,
            value: e.capacity ? Math.min(120, (filled / e.capacity) * 100) : 0,
            hint: `${filled} of ${e.capacity} · ${s?.waitlistCount ?? 0} waitlisted · ${inr(s?.revenue ?? 0, { compact: true })}`,
          };
        })
        .sort((a, b) => b.value - a.value),
    [rows, statMap],
  );

  return (
    <Page>
      <PageHeader
        title="Events"
        description="Capacity, demand and money per sub-event. Over-subscribed events waitlist automatically; empty ones need promoting or cancelling."
      />

      <NeoSegmented
        value={track}
        onChange={setTrack}
        options={[
          { value: "all", label: "All tracks" },
          ...TRACKS.map((t) => ({ value: t.id, label: t.label })),
        ]}
      />

      <NeoCard>
        <NeoCard.Header
          eyebrow="Demand"
          title="Fill rate"
          subtitle="Stronger colour means closer to capacity. Click to open the event."
        />
        <NeoCard.Raw>
          {heat.length ? (
            <HeatmapGrid cells={heat} onCellClick={(id) => setOpenId(id)} legendHigh="At capacity" />
          ) : (
            <NeoSkeleton className="h-32" />
          )}
        </NeoCard.Raw>
      </NeoCard>

      <NeoCard>
        <NeoCard.Body flush>
          <DataTable
            rows={rows}
            columns={columns}
            rowKey={(e) => e.id}
            loading={events.loading}
            onRowClick={(e) => setOpenId(e.id)}
            sort={{ key: "fill", dir: "desc" }}
            pageSize={25}
            empty={<EmptyState icon={<CalendarDays />} title="No events in this track" />}
          />
        </NeoCard.Body>
      </NeoCard>

      <NeoDrawer
        open={!!focused}
        onOpenChange={(v) => !v && setOpenId(null)}
        eyebrow={focused ? TRACKS.find((t) => t.id === focused.track)?.label : undefined}
        title={focused?.title ?? ""}
        footer={
          focused ? (
            <NeoButton
              size="sm"
              variant="secondary"
              onClick={async () => {
                const next =
                  focused.status === "published" ? "registration_closed" : "published";
                await getRepo().events.update(focused.id, { status: next });
                toast.success(
                  next === "published" ? "Registrations reopened" : "Registrations closed",
                );
                events.reload();
              }}
            >
              {focused.status === "published" ? "Close registrations" : "Reopen registrations"}
            </NeoButton>
          ) : null
        }
      >
        {focused ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <MiniStat label="Confirmed" value={String(focusedStats?.confirmedCount ?? 0)} />
              <MiniStat label="Waitlist" value={String(focusedStats?.waitlistCount ?? 0)} />
              <MiniStat
                label="Revenue"
                value={inr(focusedStats?.revenue ?? 0, { compact: true })}
              />
            </div>
            <dl className="divide-y divide-hairline">
              <KeyValue label="Venue" value={focused.venue} />
              <KeyValue
                label="Starts"
                value={new Date(focused.startsAt).toLocaleString("en-IN")}
              />
              <KeyValue label="Ends" value={new Date(focused.endsAt).toLocaleString("en-IN")} />
              <KeyValue
                label="Format"
                value={
                  focused.maxTeamSize === 1
                    ? "Solo"
                    : `Team of ${focused.minTeamSize}–${focused.maxTeamSize}`
                }
              />
              <KeyValue label="Capacity" value={focused.capacity?.toString() ?? "Unlimited"} />
              <KeyValue label="Entry fee" value={inr(focused.feeInr)} />
              <KeyValue
                label="Indemnity required"
                value={focused.requiresIndemnity ? "Yes" : "No"}
              />
              <KeyValue label="Coordinator" value={focused.coordinatorName} />
              <KeyValue label="Coordinator phone" value={focused.coordinatorPhone} mono />
            </dl>
          </div>
        ) : null}
      </NeoDrawer>
    </Page>
  );
}

function MiniStat({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div className="neo-inset-sm rounded-neo p-2.5 text-center">
      <div className="engraved mb-1 !text-[0.56rem]">{label}</div>
      <div
        className={`tnum font-display text-[0.98rem] font-semibold ${bad ? "text-failed" : "text-ink"}`}
      >
        {value}
      </div>
    </div>
  );
}
