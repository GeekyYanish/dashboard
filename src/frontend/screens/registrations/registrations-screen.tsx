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

const STATUSES = ["pending", "confirmed", "waitlisted", "cancelled", "rejected"] as const;

export function RegistrationsScreen() {
  const lookups = useLookups();
  const [search, setSearch] = useState("");
  const dSearch = useDebounced(search, 220);
  const [facetState, setFacetState] = useState<Record<string, string[]>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<SortState>({ key: "registeredAt", dir: "desc" });
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    for (const p of payments.data ?? [])
      for (const rid of p.registrationIds) {
        // Verified wins over pending if a registration is covered twice.
        if (m.get(rid) === "verified") continue;
        m.set(rid, p.status);
      }
    return m;
  }, [payments.data]);

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

  const exportCsv = () => {
    const data = rows.data ?? [];
    downloadCsv(`registrations-${new Date().toISOString().slice(0, 10)}.csv`, [
      ["Reg ID", "Participant", "Participant code", "College", "Event", "Track", "Status", "Payment", "Fee", "Registered", "Source"],
      ...data.map((r) => {
        const p = lookups.participant(r.participantId);
        const c = lookups.collegeOf(r.participantId);
        const e = lookups.event(r.eventId);
        return [
          r.code,
          p?.fullName ?? "",
          p?.code ?? "",
          c?.name ?? "",
          e?.title ?? "",
          e?.track ?? "",
          r.status,
          payByReg.get(r.id) ?? "unpaid",
          r.feeInr,
          r.registeredAt,
          r.source,
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
            <NeoButton size="sm" variant="secondary" icon={<Download />} onClick={exportCsv}>
              Export
            </NeoButton>
            <Link href="/registrations/import">
              <NeoButton size="sm" variant="secondary" icon={<Upload />}>
                Import CSV
              </NeoButton>
            </Link>
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

      <NeoCard>
        <NeoCard.Body flush>
          <DataTable
            rows={rows.data ?? []}
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
