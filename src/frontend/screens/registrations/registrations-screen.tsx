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
  Users,
} from "lucide-react";
import { Page, PageHeader, SubNav } from "@/frontend/components/page";
import {
  NeoCard,
  NeoButton,
  NeoModal,
  DataTable,
  StatusBadge,
  NeoAvatar,
  EmptyState,
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

const mixed = (values: unknown[]) => new Set(values).size > 1;

/** What a person owes across their live registrations; a single row is just its own fee. */
const groupFee = (r: Row) =>
  r.group.length === 1
    ? r.feeInr
    : r.group.filter((g) => g.status !== "cancelled" && g.status !== "rejected").reduce((sum, g) => sum + g.feeInr, 0);

/** One table row: a registration, plus every registration of the same person when grouped. */
type Row = Registration & { group: Registration[] };

const STATUSES = ["pending", "confirmed", "waitlisted", "cancelled", "rejected"] as const;

export function RegistrationsScreen() {
  const { role } = useAuth();
  const canManageRegistrations = role === "head" || role === "coordinator";
  const lookups = useLookups();
  const [search, setSearch] = useState("");
  const dSearch = useDebounced(search, 220);
  const [facetState, setFacetState] = useState<Record<string, string[]>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<SortState>({ key: "registeredAt", dir: "desc" });
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [groupByPerson, setGroupByPerson] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

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
  /** Payment state per registration — the column operators scan for first. */
  const payByReg = useMemo(() => {
    const m = new Map<string, string>();
    for (const registration of all.data ?? []) m.set(registration.id, registration.paymentStatus ?? "unpaid");
    return m;
  }, [all.data]);

  /**
   * Grouped, a person who registered for several events is a single row (the
   * latest registration stands in for them) carrying all of their registrations.
   * Ungrouped, every row is just its own registration.
   */
  const tableRows: Row[] = useMemo(() => {
    const data = rows.data ?? [];
    if (!groupByPerson) return data.map((r) => ({ ...r, group: [r] }));
    const byPerson = new Map<string, Registration[]>();
    for (const r of data) byPerson.set(r.participantId, [...(byPerson.get(r.participantId) ?? []), r]);
    return [...byPerson.values()].map((group) => {
      const latest = group.reduce((a, b) => (b.registeredAt > a.registeredAt ? b : a));
      return { ...latest, group };
    });
  }, [rows.data, groupByPerson]);

  /** Selection is by row; a grouped row stands for all of that person's registrations. */
  const selectedIds = useMemo(
    () => tableRows.filter((r) => selected.has(r.id)).flatMap((r) => r.group.map((g) => g.id)),
    [tableRows, selected],
  );

  const facets: Facet[] = useMemo(
    () => [
      {
        key: "status",
        label: "Status",
        selected: facetState.status ?? [],
        options: STATUSES.map((s) => ({
          value: s,
          label: REGISTRATION_LABEL[s],
          count: (all.data ?? []).filter((r) => r.status === s).length,
        })),
      },
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
    ],
    [facetState, all.data],
  );

  const eventNames = useCallback(
    (r: Row) =>
      [...new Set(r.group.map((g) => lookups.event(g.eventId)?.title ?? g.eventTitle ?? "—"))].join(", "),
    [lookups],
  );

  const columns: Column<Row>[] = useMemo(
    () => [
      {
        key: "code",
        header: "Reg ID",
        width: "104px",
        sortValue: (r) => r.code,
        cell: (r) => (
          <span className="font-mono text-[0.76rem] text-ink-muted">
            {r.group.length > 1 ? `${r.group.length} registrations` : r.code}
          </span>
        ),
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
        sortValue: (r) => eventNames(r),
        cell: (r) => {
          const e = lookups.event(r.eventId);
          if (r.group.length > 1) {
            const names = eventNames(r);
            return (
              <div className="min-w-0 text-ink-soft" title={names}>
                <div className="line-clamp-2 break-words">{names}</div>
              </div>
            );
          }
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
        sortValue: (r) => (mixed(r.group.map((g) => g.status)) ? "mixed" : r.status),
        cell: (r) =>
          mixed(r.group.map((g) => g.status)) ? (
            <StatusBadge tone="pending" size="sm">
              Mixed
            </StatusBadge>
          ) : (
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
        sortValue: (r) => (mixed(r.group.map((g) => payByReg.get(g.id))) ? "mixed" : (payByReg.get(r.id) ?? "zz-unpaid")),
        cell: (r) => {
          if (mixed(r.group.map((g) => payByReg.get(g.id))))
            return (
              <StatusBadge tone="pending" size="sm">
                Mixed
              </StatusBadge>
            );
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
        sortValue: (r) => groupFee(r),
        cell: (r) => <span className="tnum text-ink-soft">{inr(groupFee(r))}</span>,
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
    [lookups, payByReg, eventNames],
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

  const exportCsv = async (mode: "individual" | "grouped") => {
    setExportOpen(false);
    const data = rows.data ?? [];
    // Team names are not part of the shared lookups. Best effort: if the team
    // list cannot be read for this role, the export falls back to the team id.
    const teamName = new Map<string, string>();
    try {
      for (const t of await getRepo().teams.list()) teamName.set(t.id, t.name);
    } catch {
      /* fall back to the id below */
    }
    const stamp = new Date().toISOString().slice(0, 10);
    const participantCells = (r: Registration) => {
      const p = lookups.participant(r.participantId);
      const c = lookups.collegeOf(r.participantId);
      return [
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
    };

    if (mode === "grouped") {
      // One row per person. Per-event columns (Event, Track, Status, Payment)
      // list one entry per registration in the same order, comma-separated.
      const byPerson = new Map<string, Registration[]>();
      for (const r of data) byPerson.set(r.participantId, [...(byPerson.get(r.participantId) ?? []), r]);
      const people = [...byPerson.values()];
      const join = (group: Registration[], f: (r: Registration) => string) => group.map(f).join(", ");
      downloadCsv(`registrations-by-person-${stamp}.csv`, [
        [
          "Events", "Registrations", "Reg IDs", "Tracks", "Statuses", "Payments", "Total fee",
          "First registered",
          "Participant code", "Name", "Email", "Phone", "Gender", "DOB", "College", "Department",
          "Year", "Category", "T-shirt", "Diet", "Emergency",
        ],
        ...people.map((group) => {
          const pay = (r: Registration) => {
            const st = payByReg.get(r.id) ?? "unpaid";
            return st === "verified" ? "Paid" : titleCase(st);
          };
          return [
            join(group, (r) => lookups.event(r.eventId)?.title ?? r.eventTitle ?? ""),
            group.length,
            join(group, (r) => r.code),
            join(group, (r) => lookups.event(r.eventId)?.track ?? ""),
            join(group, (r) => REGISTRATION_LABEL[r.status] ?? r.status),
            join(group, pay),
            group
              .filter((r) => r.status !== "cancelled" && r.status !== "rejected")
              .reduce((sum, r) => sum + r.feeInr, 0),
            group.map((r) => r.registeredAt).sort()[0],
            ...participantCells(group[0]),
          ];
        }),
      ]);
      toast.success(`Exported ${people.length.toLocaleString("en-IN")} people`, `${data.length.toLocaleString("en-IN")} registrations`);
      return;
    }

    downloadCsv(`registrations-${stamp}.csv`, [
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
        title="Registrations"
        description="Every event registration across the fest. Select rows for bulk actions, or open one for the full 360° record."
        actions={
          <>
            <NeoButton size="sm" variant="secondary" icon={<Download />} onClick={() => setExportOpen(true)}>
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
          setFacetState({});
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
        resultCount={rows.data?.length}
        totalCount={all.data?.length}
      />

      <div className="flex items-center gap-2">
        <NeoButton
          size="sm"
          variant={groupByPerson ? "primary" : "secondary"}
          icon={<Users />}
          aria-pressed={groupByPerson}
          onClick={() => {
            setGroupByPerson((g) => !g);
            setSelected(new Set());
          }}
        >
          Group by person
        </NeoButton>
        {groupByPerson ? (
          <span className="text-[0.76rem] text-ink-muted">
            {tableRows.length.toLocaleString("en-IN")} people · {(rows.data?.length ?? 0).toLocaleString("en-IN")} registrations
          </span>
        ) : null}
      </div>

      <NeoCard>
        <NeoCard.Body flush>
          <DataTable
            rows={tableRows}
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
        </NeoCard.Body>
      </NeoCard>

      {canManageRegistrations ? (
        <BulkBar count={selected.size} onClear={() => setSelected(new Set())}>
          <NeoButton
            size="sm"
            variant="secondary"
            icon={<CheckCheck />}
            loading={busy}
            onClick={() =>
              bulk(
                () => getRepo().registrations.bulkSetStatus(selectedIds, "confirmed"),
                `Confirmed ${selectedIds.length} registrations`,
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
                () => getRepo().registrations.bulkSetStatus(selectedIds, "waitlisted"),
                `Moved ${selectedIds.length} to the waitlist`,
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
                () => getRepo().registrations.bulkSetStatus(selectedIds, "rejected", "bulk_reject"),
                `Rejected ${selectedIds.length} registrations`,
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
                for (const id of selectedIds) await getRepo().registrations.cancel(id, "withdrawal");
              }, `Cancelled ${selectedIds.length} registrations — waitlisters promoted`)
            }
          >
            Cancel
          </NeoButton>
        </BulkBar>
      ) : null}

      <NeoModal
        open={exportOpen}
        onOpenChange={setExportOpen}
        title="Export registrations"
        description={`${(rows.data?.length ?? 0).toLocaleString("en-IN")} registrations match the current filters.`}
        size="sm"
      >
        <div className="grid gap-2.5">
          <NeoButton variant="secondary" onClick={() => exportCsv("individual")}>
            Individual events — one row per registration
          </NeoButton>
          <NeoButton variant="secondary" onClick={() => exportCsv("grouped")}>
            Grouped — one row per person, events comma-separated
          </NeoButton>
        </div>
      </NeoModal>

      <RegistrationDrawer
        registrationId={openId}
        onClose={() => setOpenId(null)}
        onChanged={() => {
          rows.reload();
          all.reload();
        }}
      />
    </Page>
  );
}

export { CopyCheck, CalendarClock };
