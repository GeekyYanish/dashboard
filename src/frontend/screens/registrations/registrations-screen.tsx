"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  Download,
  Upload,
  Plus,
  CheckCheck,
  XCircle,
  Ban,
  ArrowUpFromLine,
  Send,
  CopyCheck,
  CalendarClock,
  ListOrdered,
} from "lucide-react";
import { Page, PageHeader, SubNav } from "@/frontend/components/page";
import {
  NeoCard,
  NeoButton,
  DataTable,
  StatusBadge,
  NeoAvatar,
  EmptyState,
  NeoTooltip,
  toast,
  type Column,
  type SortState,
} from "@/frontend/components/neo";
import { FilterBar, BulkBar, type Facet } from "@/frontend/components/filter-bar";
import { RegistrationDrawer } from "./registration-drawer";
import { useAsync, useDebounced } from "@/frontend/hooks/use-async";
import { useLookups } from "@/frontend/hooks/use-lookups";
import { getRepo } from "@/lib/data";
import { isDataError, type Registration } from "@/lib/data/types";
import { CATEGORIES, TRACKS, inr } from "@/lib/fest.config";
import { REGISTRATION_LABEL, REGISTRATION_TONE, titleCase } from "@/frontend/status";
import { downloadCsv, relativeTime } from "@/lib/utils";
import { useAuth } from "@/frontend/hooks/use-auth";

const STATUSES = ["pending", "confirmed", "waitlisted", "cancelled", "rejected"] as const;

function resolveEventTrack(eventId: string, lookups: any): string {
  const ev = lookups.event(eventId);
  if (ev?.track) return ev.track;
  const id = (eventId || "").toLowerCase();
  if (id.includes("design") || id.includes("art")) return "design";
  if (id.includes("game") || id.includes("gaming") || id.includes("esport")) return "gaming";
  if (id.includes("quiz") || id.includes("literary") || id.includes("debate") || id.includes("paper")) return "literary";
  if (id.includes("dance") || id.includes("music") || id.includes("cultural") || id.includes("twin") || id.includes("quest")) return "cultural";
  if (id.includes("sport")) return "sports";
  return "technical";
}

export interface UserRegistrationRow {
  id: string;
  participantId: string;
  code: string;
  participantName: string;
  participantEmail: string;
  collegeName: string | null;
  department: string | null;
  yearOfStudy: number | null;
  events: Array<{
    id: string;
    code: string;
    eventId: string;
    eventTitle: string;
    track?: string;
    trackShort?: string;
    teamId: string | null;
    status: Registration["status"];
    registeredAt: string;
  }>;
  status: Registration["status"];
  paymentStatus: string;
  totalFeeInr: number;
  registeredAt: string;
  primaryRegistrationId: string;
}

export function RegistrationsScreen({ initialUserMode = false }: { initialUserMode?: boolean }) {
  const { role } = useAuth();
  const canManageRegistrations = role === "head" || role === "coordinator";
  const lookups = useLookups();
  const [search, setSearch] = useState("");
  const dSearch = useDebounced(search, 220);
  const [facetState, setFacetState] = useState<Record<string, string[]>>(
    initialUserMode ? { user: ["paid"] } : {},
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<SortState>({ key: "registeredAt", dir: "desc" });
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isUserMode = facetState.user ? facetState.user.includes("paid") : Boolean(initialUserMode);

  const filter = useMemo(
    () => ({
      search: dSearch || undefined,
      status: facetState.status?.length ? (facetState.status as Registration["status"][]) : undefined,
      eventId: facetState.event?.[0],
      collegeId: facetState.college?.[0],
      category: facetState.category?.[0],
      track: facetState.track?.[0],
      source: facetState.source?.length ? facetState.source : undefined,
      paymentStatus: facetState.payment?.length ? facetState.payment : undefined,
    }),
    [dSearch, facetState],
  );

  const rows = useAsync(() => getRepo().registrations.list(filter), [filter]);
  const all = useAsync(() => getRepo().registrations.list(), []);
  const views = useAsync(() => getRepo().views.list("registrations"), []);
  const payments = useAsync(() => getRepo().payments.list(), []);

  /** Payment state per registration — the column operators scan for first. */
  const payByReg = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of payments.data ?? []) {
      for (const rid of p.registrationIds) {
        // Verified wins over pending if a registration is covered twice.
        if (m.get(rid) === "verified") continue;
        m.set(rid, p.status);
      }
    }
    for (const registration of all.data ?? []) {
      if (registration.paymentStatus && m.get(registration.id) !== "verified") {
        m.set(registration.id, registration.paymentStatus);
      }
    }
    return m;
  }, [payments.data, all.data]);

  /** Aggregated user rows: all participants who registered and completed payment */
  const userAggregatedRows = useMemo(() => {
    if (!all.data) return [];

    const map = new Map<string, Registration[]>();
    for (const reg of all.data) {
      const list = map.get(reg.participantId) ?? [];
      list.push(reg);
      map.set(reg.participantId, list);
    }

    const res: UserRegistrationRow[] = [];
    for (const [participantId, userRegs] of map.entries()) {
      const hasVerifiedReg = userRegs.some((r) => {
        const pStatus = payByReg.get(r.id) ?? r.paymentStatus;
        return pStatus === "verified";
      });
      const hasVerifiedPayment = (payments.data ?? []).some(
        (p) => p.participantId === participantId && p.status === "verified",
      );

      // Only include participants whose festival pass payment is completed
      // Exclude users whose payments are unpaid, pending review, or rejected
      if (!hasVerifiedReg && !hasVerifiedPayment) {
        continue;
      }

      const p = lookups.participant(participantId);
      const c = lookups.collegeOf(participantId);

      const activeRegs = userRegs.filter((r) => r.status !== "cancelled");
      const eventRegs = activeRegs.length > 0 ? activeRegs : userRegs;

      const events = eventRegs.map((r) => {
        const ev = lookups.event(r.eventId);
        const trackId = ev?.track || resolveEventTrack(r.eventId, lookups);
        const tr = TRACKS.find((t) => t.id === trackId);
        return {
          id: r.id,
          code: r.code,
          eventId: r.eventId,
          eventTitle: ev?.title ?? r.eventTitle ?? r.eventId,
          track: tr?.label ?? trackId,
          trackShort: tr?.short,
          teamId: r.teamId,
          status: r.status,
          registeredAt: r.registeredAt,
        };
      });

      const overallStatus = userRegs.some((r) => r.status === "confirmed")
        ? "confirmed"
        : userRegs[0]?.status ?? "pending";

      const earliestDate = userRegs.reduce(
        (earliest, r) => (new Date(r.registeredAt) < new Date(earliest) ? r.registeredAt : earliest),
        userRegs[0]?.registeredAt ?? new Date().toISOString(),
      );

      const totalFeeFromRegs = userRegs.reduce((sum, r) => sum + (r.feeInr || 0), 0);
      const paidAmount = (payments.data ?? [])
        .filter((pay) => pay.participantId === participantId && pay.status === "verified")
        .reduce((sum, pay) => sum + (pay.amount || 0), 0);
      const totalFee = totalFeeFromRegs > 0 ? totalFeeFromRegs : paidAmount;

      const primaryReg = userRegs.find((r) => r.status === "confirmed") ?? userRegs[0];

      res.push({
        id: participantId,
        participantId,
        code: p?.code ?? userRegs[0]?.participantCode ?? participantId.slice(0, 8),
        participantName: p?.fullName ?? userRegs[0]?.participantName ?? "Unknown",
        participantEmail: p?.email ?? userRegs[0]?.participantEmail ?? "",
        collegeName: c?.shortName ?? c?.name ?? p?.collegeName ?? null,
        department: p?.department ?? null,
        yearOfStudy: p?.yearOfStudy ?? null,
        events,
        status: overallStatus,
        paymentStatus: "verified",
        totalFeeInr: totalFee,
        registeredAt: earliestDate,
        primaryRegistrationId: primaryReg?.id ?? "",
      });
    }

    return res;
  }, [all.data, payByReg, payments.data, lookups]);

  const paidUsersCount = userAggregatedRows.length;

  /** Filtered rows for non-user mode (All registrations) since backend lacks some filters */
  const displayRows = useMemo(() => {
    if (isUserMode) return [];
    let list = rows.data ?? [];

    if (facetState.track?.length) {
      list = list.filter((r) => {
        const track = resolveEventTrack(r.eventId, lookups);
        return facetState.track.includes(track);
      });
    }

    if (facetState.category?.length) {
      list = list.filter((r) => {
        const p = lookups.participant(r.participantId);
        const cat = p?.category || "participant";
        return facetState.category.includes(cat);
      });
    }

    return list;
  }, [isUserMode, rows.data, facetState, lookups]);

  /** Filtered and searched rows when User mode is active */
  const userDisplayRows = useMemo(() => {
    if (!isUserMode) return [];
    let list = userAggregatedRows;

    if (dSearch) {
      const q = dSearch.toLowerCase();
      list = list.filter(
        (u) =>
          u.participantName.toLowerCase().includes(q) ||
          u.code.toLowerCase().includes(q) ||
          u.participantEmail.toLowerCase().includes(q) ||
          (u.collegeName && u.collegeName.toLowerCase().includes(q)) ||
          u.events.some((e) => e.eventTitle.toLowerCase().includes(q)),
      );
    }

    if (facetState.status?.length) {
      list = list.filter((u) => facetState.status.includes(u.status));
    }

    if (facetState.track?.length) {
      list = list
        .filter((u) =>
          u.events.some((e) => facetState.track.includes(resolveEventTrack(e.eventId, lookups))),
        )
        .map((u) => ({
          ...u,
          events: u.events.filter((e) =>
            facetState.track.includes(resolveEventTrack(e.eventId, lookups)),
          ),
        }));
    }

    if (facetState.category?.length) {
      list = list.filter((u) => {
        const p = lookups.participant(u.participantId);
        const cat = p?.category || "participant";
        return facetState.category.includes(cat);
      });
    }

    return list;
  }, [isUserMode, userAggregatedRows, dSearch, facetState, lookups]);

  const facets: Facet[] = useMemo(
    () => [
      {
        key: "status",
        label: "Status",
        selected: facetState.status ?? [],
        options: STATUSES.map((s) => ({
          value: s,
          label: REGISTRATION_LABEL[s],
          count: isUserMode
            ? userAggregatedRows.filter((u) => u.status === s).length
            : (all.data ?? []).filter((r) => r.status === s).length,
        })),
      },
      ...(!isUserMode
        ? [
            {
              key: "payment",
              label: "Payment",
              selected: facetState.payment ?? [],
              options: [
                { value: "verified", label: "Verified" },
                { value: "pending", label: "Awaiting review" },
                { value: "rejected", label: "Rejected" },
                { value: "unpaid", label: "No payment yet" },
              ],
            },
          ]
        : []),
      {
        key: "user",
        label: "User",
        selected: isUserMode ? ["paid"] : [],
        options: [
          {
            value: "paid",
            label: "Paid & Registered",
            count: paidUsersCount,
          },
        ],
      },
      {
        key: "track",
        label: "Track",
        selected: facetState.track ?? [],
        options: TRACKS.map((t) => ({ value: t.id, label: t.label })),
      },
      {
        key: "category",
        label: "Category",
        selected: facetState.category ?? [],
        options: CATEGORIES.map((c) => ({ value: c.id, label: c.label })),
      },
      ...(!isUserMode
        ? [
            {
              key: "source",
              label: "Source",
              selected: facetState.source ?? [],
              options: [
                { value: "online", label: "Online" },
                { value: "on_spot", label: "On-spot desk" },
                { value: "csv_import", label: "CSV import" },
              ],
            },
          ]
        : []),
    ],
    [facetState, all.data, isUserMode, paidUsersCount, userAggregatedRows],
  );

  const columns: Column<Registration>[] = useMemo(
    () => [
      {
        key: "code",
        header: "Reg ID",
        width: "104px",
        sortValue: (r) => r.code,
        cell: (r) => <span className="font-mono text-[0.76rem] text-ink-muted">{r.code}</span>,
      },
      {
        key: "participant",
        header: "Participant",
        sortValue: (r) => lookups.participant(r.participantId)?.fullName ?? "",
        cell: (r) => {
          const p = lookups.participant(r.participantId);
          const c = lookups.collegeOf(r.participantId);
          return (
            <div className="flex min-w-0 items-center gap-2.5">
              <NeoAvatar name={p?.fullName ?? "?"} size={28} />
              <div className="min-w-0">
                <div className="truncate font-medium text-ink">{p?.fullName ?? "Unknown"}</div>
                <div className="truncate text-[0.72rem] text-ink-muted">
                  {c?.shortName ?? "—"} · {p?.code ?? ""}
                </div>
              </div>
            </div>
          );
        },
      },
      {
        key: "event",
        header: "Event",
        sortValue: (r) => lookups.event(r.eventId)?.title ?? "",
        cell: (r) => {
          const e = lookups.event(r.eventId);
          return (
            <div className="min-w-0">
              <div className="truncate text-ink-soft">{e?.title ?? "—"}</div>
              <div className="truncate text-[0.72rem] text-ink-faint">
                {TRACKS.find((t) => t.id === e?.track)?.label ?? ""}
                {r.teamId ? " · team" : ""}
              </div>
            </div>
          );
        },
      },
      {
        key: "status",
        header: "Status",
        width: "128px",
        sortValue: (r) => r.status,
        cell: (r) => (
          <StatusBadge tone={REGISTRATION_TONE[r.status]} size="sm">
            {REGISTRATION_LABEL[r.status]}
            {r.status === "waitlisted" && r.waitlistPosition ? ` #${r.waitlistPosition}` : ""}
          </StatusBadge>
        ),
      },
      {
        key: "payment",
        header: "Payment",
        width: "126px",
        sortValue: (r) => payByReg.get(r.id) ?? "zz-unpaid",
        cell: (r) => {
          const st = payByReg.get(r.id);
          if (!st)
            return (
              <StatusBadge tone="failed" size="sm" dot={false}>
                Unpaid
              </StatusBadge>
            );
          return (
            <StatusBadge
              tone={st === "verified" ? "paid" : st === "pending" ? "pending" : "failed"}
              size="sm"
            >
              {st === "verified" ? "Paid" : titleCase(st)}
            </StatusBadge>
          );
        },
      },
      {
        key: "fee",
        header: "Fee",
        width: "84px",
        align: "right",
        sortValue: (r) => r.feeInr,
        cell: (r) => <span className="tnum text-ink-soft">{inr(r.feeInr)}</span>,
      },
      {
        key: "registeredAt",
        header: "Registered",
        width: "110px",
        hideBelow: "lg",
        sortValue: (r) => r.registeredAt,
        cell: (r) => <span className="text-[0.76rem] text-ink-muted">{relativeTime(r.registeredAt)}</span>,
      },
      {
        key: "source",
        header: "Source",
        width: "96px",
        optional: true,
        sortValue: (r) => r.source,
        cell: (r) => <span className="text-[0.76rem] text-ink-muted">{titleCase(r.source)}</span>,
      },
    ],
    [lookups, payByReg],
  );

  const userColumns: Column<UserRegistrationRow>[] = useMemo(
    () => [
      {
        key: "code",
        header: "User ID",
        width: "116px",
        sortValue: (u) => u.code,
        cell: (u) => <span className="font-mono text-[0.76rem] text-ink-muted">{u.code}</span>,
      },
      {
        key: "participant",
        header: "Participant",
        sortValue: (u) => u.participantName,
        cell: (u) => (
          <div className="flex min-w-0 items-center gap-2.5">
            <NeoAvatar name={u.participantName} size={28} />
            <div className="min-w-0">
              <div className="truncate font-medium text-ink">{u.participantName}</div>
              <div className="truncate text-[0.72rem] text-ink-muted">
                {u.collegeName ?? "—"}
                {u.department ? ` · ${u.department}` : ""}
              </div>
            </div>
          </div>
        ),
      },
      {
        key: "events",
        header: "Events",
        sortValue: (u) => u.events.length,
        cell: (u) => (
          <div className="flex flex-wrap items-center gap-1.5 py-1">
            {u.events.slice(0, 3).map((ev) => (
              <span
                key={ev.id}
                className="inline-flex items-center gap-1 rounded-neo-sm bg-plane-alt px-2 py-0.5 text-[0.72rem] font-medium text-ink-soft border border-hairline"
                title={`${ev.eventTitle}${ev.track ? ` (${ev.track})` : ""}${ev.teamId ? " · Team" : ""}`}
              >
                <span className="truncate max-w-[130px] font-medium text-ink">{ev.eventTitle}</span>
                {ev.trackShort ? (
                  <span className="text-[0.65rem] text-ink-muted">· {ev.trackShort}</span>
                ) : null}
                {ev.teamId ? <span className="text-[0.65rem] text-ink-faint" title="Team event">👥</span> : null}
              </span>
            ))}
            {u.events.length > 3 ? (
              <NeoTooltip
                content={
                  <div className="space-y-1.5 p-1.5 max-w-xs">
                    <div className="text-[0.72rem] font-bold text-ink border-b border-hairline pb-1">
                      All Registered Events ({u.events.length})
                    </div>
                    <div className="space-y-1">
                      {u.events.map((ev) => (
                        <div key={ev.id} className="text-[0.75rem] text-ink flex items-center justify-between gap-2">
                          <span className="truncate">• {ev.eventTitle}</span>
                          <span className="shrink-0 text-[0.68rem] text-ink-muted">
                            {ev.track ? `(${ev.track})` : ""} {ev.teamId ? "👥" : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                }
              >
                <button
                  type="button"
                  className="inline-flex items-center rounded-neo-sm bg-plane-alt px-1.5 py-0.5 text-[0.68rem] font-semibold text-ink-muted hover:text-ink cursor-pointer border border-hairline"
                >
                  +{u.events.length - 3} more
                </button>
              </NeoTooltip>
            ) : null}
          </div>
        ),
      },
      {
        key: "status",
        header: "Status",
        width: "128px",
        sortValue: (u) => u.status,
        cell: (u) => (
          <StatusBadge tone={REGISTRATION_TONE[u.status]} size="sm">
            {REGISTRATION_LABEL[u.status]}
          </StatusBadge>
        ),
      },
      {
        key: "payment",
        header: "Payment",
        width: "110px",
        sortValue: (u) => u.paymentStatus,
        cell: () => (
          <StatusBadge tone="paid" size="sm">
            Paid
          </StatusBadge>
        ),
      },
      {
        key: "fee",
        header: "Fee",
        width: "90px",
        align: "right",
        sortValue: (u) => u.totalFeeInr,
        cell: (u) => <span className="tnum text-ink-soft">{inr(u.totalFeeInr)}</span>,
      },
      {
        key: "registeredAt",
        header: "Registered",
        width: "110px",
        hideBelow: "lg",
        sortValue: (u) => u.registeredAt,
        cell: (u) => <span className="text-[0.76rem] text-ink-muted">{relativeTime(u.registeredAt)}</span>,
      },
    ],
    [],
  );

  const bulk = useCallback(
    async (fn: () => Promise<unknown>, label: string) => {
      setBusy(true);
      try {
        await fn();
        toast.success(label);
        setSelected(new Set());
        rows.reload();
        all.reload();
      } catch (e) {
        toast.error(
          isDataError(e) ? e.message : "Something went wrong",
          isDataError(e) ? e.code : undefined,
        );
      } finally {
        setBusy(false);
      }
    },
    [rows, all],
  );

  const exportCsv = async () => {
    if (isUserMode) {
      downloadCsv(`paid-users-registrations-${new Date().toISOString().slice(0, 10)}.csv`, [
        [
          "User Code",
          "Name",
          "Email",
          "College",
          "Department",
          "Year",
          "Registered Events",
          "Events Count",
          "Status",
          "Payment",
          "Fee",
          "Registered At",
        ],
        ...userDisplayRows.map((u) => [
          u.code,
          u.participantName,
          u.participantEmail,
          u.collegeName ?? "",
          u.department ?? "",
          u.yearOfStudy ?? "",
          u.events.map((e) => e.eventTitle).join("; "),
          u.events.length,
          REGISTRATION_LABEL[u.status] ?? u.status,
          "Paid",
          u.totalFeeInr,
          u.registeredAt,
        ]),
      ]);
      toast.success(`Exported ${userDisplayRows.length.toLocaleString("en-IN")} users`);
      return;
    }

    const data = displayRows;
    const teamName = new Map<string, string>();
    try {
      for (const t of await getRepo().teams.list()) teamName.set(t.id, t.name);
    } catch {
      /* fall back to the id below */
    }
    downloadCsv(`registrations-${new Date().toISOString().slice(0, 10)}.csv`, [
      [
        // Registration
        "Reg ID", "Event", "Track", "Team", "Status", "Payment", "Fee", "Source",
        "Registered", "Confirmed", "Cancelled", "Cancel reason", "Waitlist position",
        "Payment override reason", "Notes",
        // Participant — the same columns as the participants export
        "Participant code", "Name", "Email", "Phone", "Gender", "DOB", "College", "Department",
        "Year", "Category", "T-shirt", "Diet", "Emergency",
      ],
      ...data.map((r) => {
        const p = lookups.participant(r.participantId);
        const c = lookups.collegeOf(r.participantId);
        const e = lookups.event(r.eventId);
        const pay = payByReg.get(r.id) ?? "unpaid";
        return [
          r.code,
          e?.title ?? r.eventTitle ?? "",
          e?.track ?? "",
          r.teamId ? (teamName.get(r.teamId) ?? r.teamId) : "",
          REGISTRATION_LABEL[r.status] ?? r.status,
          pay === "verified" ? "Paid" : titleCase(pay),
          r.feeInr,
          titleCase(r.source),
          r.registeredAt,
          r.confirmedAt ?? "",
          r.cancelledAt ?? "",
          r.cancelReason ?? "",
          r.waitlistPosition ?? "",
          r.overrideReason ?? "",
          r.notes ?? "",
          p?.code ?? r.participantCode ?? "",
          p?.fullName ?? r.participantName ?? "",
          p?.email ?? r.participantEmail ?? "",
          p?.phone ?? "",
          p?.gender ?? "",
          p?.dateOfBirth ?? "",
          c?.name ?? "",
          p?.department ?? "",
          p?.yearOfStudy ?? "",
          p?.category ?? "",
          p?.tshirtSize ?? "",
          p?.dietaryPref ?? "",
          p ? `${p.emergencyName} ${p.emergencyPhone}` : "",
        ];
      }),
    ]);
    toast.success(`Exported ${data.length.toLocaleString("en-IN")} rows`);
  };

  return (
    <Page>
      <PageHeader
        title={isUserMode ? "Registrations by User" : "Registrations"}
        description={
          isUserMode
            ? "Participants who have registered with completed payments and their registered events."
            : "Every event registration across the fest. Select rows for bulk actions, or open one for the full 360° record."
        }
        actions={
          <>
            <NeoButton size="sm" variant="secondary" icon={<Download />} onClick={exportCsv}>
              Export
            </NeoButton>
            {canManageRegistrations ? (
              <Link href="/registrations/import">
                <NeoButton size="sm" variant="secondary" icon={<Upload />}>
                  Import CSV
                </NeoButton>
              </Link>
            ) : null}
            <Link href="/desk">
              <NeoButton size="sm" variant="primary" icon={<Plus />}>
                New registration
              </NeoButton>
            </Link>
          </>
        }
      />

      <SubNav
        links={[
          { href: "/registrations", label: "All", count: all.data?.length },
          { href: "/registrations/users", label: "User", count: paidUsersCount },
          { href: "/registrations/waitlist", label: "Waitlist" },
          { href: "/registrations/duplicates", label: "Duplicates" },
          { href: "/registrations/clashes", label: "Clashes" },
          { href: "/registrations/import", label: "Import" },
        ]}
      />

      <FilterBar
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Name, registration ID, phone or email…"
        facets={facets}
        onFacetChange={(k, v) => setFacetState((s) => ({ ...s, [k]: v }))}
        onClearAll={() => {
          setFacetState(initialUserMode ? { user: ["paid"] } : {});
          setSearch("");
        }}
        savedViews={views.data?.map((v) => ({ id: v.id, name: v.name }))}
        onApplyView={(id) => {
          const v = views.data?.find((x) => x.id === id);
          if (!v) return;
          const f = v.filters as Record<string, string[]>;
          setFacetState({
            status: f.status ?? [],
            payment: f.paymentStatus ?? [],
            source: f.source ?? [],
          });
          toast.info(`Applied view “${v.name}”`);
        }}
        resultCount={isUserMode ? userDisplayRows.length : displayRows.length}
        totalCount={isUserMode ? paidUsersCount : all.data?.length}
      />

      <NeoCard>
        <NeoCard.Body flush>
          {isUserMode ? (
            <DataTable
              rows={userDisplayRows}
              columns={userColumns}
              rowKey={(u) => u.id}
              loading={all.loading || payments.loading || lookups.loading}
              onRowClick={(u) => setOpenId(u.primaryRegistrationId)}
              sort={sort}
              onSortChange={setSort}
              pageSize={30}
              empty={
                <EmptyState
                  icon={<ListOrdered />}
                  title="No paid registered users match these filters"
                  hint="Try clearing search or filters."
                />
              }
            />
          ) : (
            <DataTable
              rows={displayRows}
              columns={columns}
              rowKey={(r) => r.id}
              loading={rows.loading || lookups.loading}
              selected={selected}
              onSelectedChange={setSelected}
              onRowClick={(r) => setOpenId(r.id)}
              sort={sort}
              onSortChange={setSort}
              pageSize={30}
              empty={
                <EmptyState
                  icon={<ListOrdered />}
                  title="No registrations match these filters"
                  hint="Try clearing a facet, or search by participant name instead."
                />
              }
            />
          )}
        </NeoCard.Body>
      </NeoCard>

      {canManageRegistrations && !isUserMode ? (
        <BulkBar count={selected.size} onClear={() => setSelected(new Set())}>
          <NeoButton
            size="sm"
            variant="secondary"
            icon={<CheckCheck />}
            loading={busy}
            onClick={() =>
              bulk(
                () => getRepo().registrations.bulkSetStatus([...selected], "confirmed"),
                `Confirmed ${selected.size} registrations`,
              )
            }
          >
            Confirm
          </NeoButton>
          <NeoButton
            size="sm"
            variant="secondary"
            icon={<ArrowUpFromLine />}
            loading={busy}
            onClick={() =>
              bulk(
                () => getRepo().registrations.bulkSetStatus([...selected], "waitlisted"),
                `Moved ${selected.size} to the waitlist`,
              )
            }
          >
            Waitlist
          </NeoButton>
          <NeoButton
            size="sm"
            variant="secondary"
            icon={<Send />}
            onClick={() => {
              toast.info(
                "Audience staged",
                `${selected.size} participants queued in Communications.`,
              );
            }}
          >
            Remind
          </NeoButton>
          <NeoButton
            size="sm"
            variant="secondary"
            icon={<XCircle />}
            loading={busy}
            onClick={() =>
              bulk(
                () => getRepo().registrations.bulkSetStatus([...selected], "rejected", "bulk_reject"),
                `Rejected ${selected.size} registrations`,
              )
            }
          >
            Reject
          </NeoButton>
          <NeoButton
            size="sm"
            variant="danger"
            icon={<Ban />}
            loading={busy}
            onClick={() =>
              bulk(async () => {
                for (const id of selected) await getRepo().registrations.cancel(id, "withdrawal");
              }, `Cancelled ${selected.size} registrations — waitlisters promoted`)
            }
          >
            Cancel
          </NeoButton>
        </BulkBar>
      ) : null}

      <RegistrationDrawer
        registrationId={openId}
        onClose={() => setOpenId(null)}
        onChanged={() => {
          rows.reload();
          all.reload();
          payments.reload();
        }}
      />
    </Page>
  );
}

export { CopyCheck, CalendarClock };
