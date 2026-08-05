"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download, Users, ShieldOff, FileDown, Trash2 } from "lucide-react";
import { Page, PageHeader } from "@/frontend/components/page";
import {
  NeoCard,
  NeoButton,
  DataTable,
  StatusBadge,
  NeoAvatar,
  EmptyState,
  NeoDrawer,
  KeyValue,
  SectionRule,
  NeoTabs,
  NeoSkeleton,
  NeoModal,
  toast,
  type Column,
  type SortState,
} from "@/frontend/components/neo";
import { FilterBar, type Facet } from "@/frontend/components/filter-bar";
import { useAsync, useDebounced } from "@/frontend/hooks/use-async";
import { useLookups } from "@/frontend/hooks/use-lookups";
import { getRepo } from "@/lib/data";
import { isDataError, type Participant } from "@/lib/data/types";
import { CATEGORIES, DOC_TYPES, inr } from "@/lib/fest.config";
import {
  ACCOMMODATION_TONE,
  DOC_TONE,
  PAYMENT_LABEL,
  PAYMENT_TONE,
  REGISTRATION_LABEL,
  REGISTRATION_TONE,
  titleCase,
} from "@/frontend/status";
import { downloadCsv, relativeTime } from "@/lib/utils";

export function ParticipantsScreen() {
  const params = useSearchParams();
  const lookups = useLookups();
  const [search, setSearch] = useState("");
  const dSearch = useDebounced(search, 220);
  const [facetState, setFacetState] = useState<Record<string, string[]>>({});
  const [sort, setSort] = useState<SortState>({ key: "name", dir: "asc" });
  const [openId, setOpenId] = useState<string | null>(params.get("focus"));

  const filter = useMemo(
    () => ({
      search: dSearch || undefined,
      category: facetState.category?.[0],
      gender: facetState.gender?.[0],
      collegeId: facetState.college?.[0],
      hasDues: facetState.money?.includes("dues") || undefined,
      docsComplete: facetState.docs?.includes("incomplete") ? false : undefined,
    }),
    [dSearch, facetState],
  );

  const rows = useAsync(() => getRepo().participants.list(filter), [filter]);
  const all = useAsync(() => getRepo().participants.list(), []);

  const facets: Facet[] = [
    {
      key: "category",
      label: "Category",
      selected: facetState.category ?? [],
      options: CATEGORIES.map((c) => ({
        value: c.id,
        label: c.label,
        count: (all.data ?? []).filter((p) => p.category === c.id).length,
      })),
    },
    {
      key: "gender",
      label: "Gender",
      selected: facetState.gender ?? [],
      options: [
        { value: "male", label: "Male" },
        { value: "female", label: "Female" },
        { value: "other", label: "Other" },
      ],
    },
    {
      key: "college",
      label: "College",
      selected: facetState.college ?? [],
      options: lookups.colleges.slice(0, 40).map((c) => ({ value: c.id, label: c.shortName })),
    },
    {
      key: "money",
      label: "Money",
      selected: facetState.money ?? [],
      options: [{ value: "dues", label: "Has outstanding dues" }],
    },
    {
      key: "docs",
      label: "Documents",
      selected: facetState.docs ?? [],
      options: [{ value: "incomplete", label: "Incomplete" }],
    },
  ];

  const columns: Column<Participant>[] = [
    {
      key: "name",
      header: "Participant",
      sortValue: (p) => p.fullName,
      cell: (p) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <NeoAvatar name={p.fullName} size={30} />
          <div className="min-w-0">
            <div className="truncate font-medium text-ink">{p.fullName}</div>
            <div className="truncate font-mono text-[0.72rem] text-ink-muted">{p.code}</div>
          </div>
        </div>
      ),
    },
    {
      key: "college",
      header: "College",
      sortValue: (p) => lookups.college(p.collegeId)?.shortName ?? "",
      cell: (p) => (
        <div className="min-w-0">
          <div className="truncate text-ink-soft">{lookups.college(p.collegeId)?.shortName}</div>
          <div className="truncate text-[0.72rem] text-ink-faint">
            {p.department}, Y{p.yearOfStudy}
          </div>
        </div>
      ),
    },
    {
      key: "category",
      header: "Category",
      width: "126px",
      sortValue: (p) => p.category,
      cell: (p) => (
        <StatusBadge tone="info" size="sm" dot={false}>
          {CATEGORIES.find((c) => c.id === p.category)?.short ?? p.category}
        </StatusBadge>
      ),
    },
    {
      key: "phone",
      header: "Phone",
      width: "134px",
      hideBelow: "md",
      cell: (p) => <span className="font-mono text-[0.75rem] text-ink-muted">{p.phone}</span>,
    },
    {
      key: "email",
      header: "Email",
      optional: true,
      cell: (p) => <span className="truncate text-[0.75rem] text-ink-muted">{p.email}</span>,
    },
    {
      key: "tshirt",
      header: "Tee",
      width: "58px",
      align: "center",
      optional: true,
      sortValue: (p) => p.tshirtSize,
      cell: (p) => <span className="text-[0.75rem] text-ink-muted">{p.tshirtSize}</span>,
    },
    {
      key: "created",
      header: "Registered",
      width: "108px",
      hideBelow: "lg",
      sortValue: (p) => p.createdAt,
      cell: (p) => <span className="text-[0.76rem] text-ink-muted">{relativeTime(p.createdAt)}</span>,
    },
  ];

  return (
    <Page>
      <PageHeader
        title="Participants"
        description="Everyone attending, in every category — competitors, delegates, accompanists, faculty escorts, volunteers and guests."
        actions={
          <NeoButton
            size="sm"
            variant="secondary"
            icon={<Download />}
            onClick={() =>
              downloadCsv("participants.csv", [
                ["Code", "Name", "Email", "Phone", "Gender", "DOB", "College", "Department", "Year", "Category", "T-shirt", "Diet", "Emergency", "Registered"],
                ...(rows.data ?? []).map((p) => [
                  p.code, p.fullName, p.email, p.phone, p.gender, p.dateOfBirth,
                  lookups.college(p.collegeId)?.name ?? "", p.department, p.yearOfStudy,
                  p.category, p.tshirtSize, p.dietaryPref,
                  `${p.emergencyName} ${p.emergencyPhone}`, p.createdAt,
                ]),
              ])
            }
          >
            Export
          </NeoButton>
        }
      />

      <FilterBar
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Name, code, phone or email…"
        facets={facets}
        onFacetChange={(k, v) => setFacetState((s) => ({ ...s, [k]: v }))}
        onClearAll={() => {
          setFacetState({});
          setSearch("");
        }}
        resultCount={rows.data?.length}
        totalCount={all.data?.length}
      />

      <NeoCard>
        <NeoCard.Body flush>
          <DataTable
            rows={rows.data ?? []}
            columns={columns}
            rowKey={(p) => p.id}
            loading={rows.loading || lookups.loading}
            onRowClick={(p) => setOpenId(p.id)}
            sort={sort}
            onSortChange={setSort}
            pageSize={30}
            empty={<EmptyState icon={<Users />} title="Nobody matches these filters" />}
          />
        </NeoCard.Body>
      </NeoCard>

      <ParticipantDrawer
        participantId={openId}
        onClose={() => setOpenId(null)}
        onChanged={() => {
          rows.reload();
          all.reload();
        }}
      />
    </Page>
  );
}

/* ==========================================================================
   The 360° profile. Also carries the DPDP obligations — export and erase.
   ========================================================================== */

type Tab = "profile" | "events" | "money" | "logistics";

function ParticipantDrawer({
  participantId,
  onClose,
  onChanged,
}: {
  participantId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const lookups = useLookups();
  const [tab, setTab] = useState<Tab>("profile");
  const [eraseOpen, setEraseOpen] = useState(false);

  const p = participantId ? lookups.participant(participantId) : undefined;
  const flags = useAsync(
    () => (participantId ? getRepo().participants.flags(participantId) : Promise.resolve(null)),
    [participantId],
  );
  const regs = useAsync(
    () => (participantId ? getRepo().registrations.forParticipant(participantId) : Promise.resolve([])),
    [participantId],
  );
  const pays = useAsync(
    () => (participantId ? getRepo().payments.forParticipant(participantId) : Promise.resolve([])),
    [participantId],
  );
  const docs = useAsync(
    () => (participantId ? getRepo().documents.forParticipant(participantId) : Promise.resolve([])),
    [participantId],
  );
  const acc = useAsync(
    () =>
      participantId
        ? getRepo().accommodation.requests().then((r) => r.filter((x) => x.participantId === participantId))
        : Promise.resolve([]),
    [participantId],
  );
  const allot = useAsync(
    () =>
      participantId
        ? getRepo().accommodation.allotments().then((r) => r.filter((x) => x.participantId === participantId))
        : Promise.resolve([]),
    [participantId],
  );
  const travel = useAsync(
    () =>
      participantId
        ? getRepo().travel.records().then((r) => r.filter((x) => x.participantId === participantId))
        : Promise.resolve([]),
    [participantId],
  );

  const college = p ? lookups.college(p.collegeId) : undefined;

  return (
    <>
      <NeoDrawer
        open={!!participantId}
        onOpenChange={(v) => !v && onClose()}
        width="lg"
        eyebrow={p?.code}
        title={p?.fullName ?? "Participant"}
        footer={
          p ? (
            <>
              <NeoButton
                size="sm"
                variant="ghost"
                icon={<FileDown />}
                onClick={async () => {
                  const data = await getRepo().participants.exportPersonalData(p.id);
                  const blob = new Blob([JSON.stringify(data, null, 2)], {
                    type: "application/json",
                  });
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = `${p.code}-personal-data.json`;
                  a.click();
                  toast.success("Personal data exported", "Everything held about this participant.");
                }}
              >
                Export data
              </NeoButton>
              <NeoButton
                size="sm"
                variant="danger"
                icon={<Trash2 />}
                onClick={() => setEraseOpen(true)}
              >
                Erase
              </NeoButton>
            </>
          ) : null
        }
      >
        {!p ? (
          <NeoSkeleton className="h-64" />
        ) : (
          <div className="space-y-4">
            <div className="neo-inset-sm flex items-start gap-3 rounded-neo p-3.5">
              <NeoAvatar name={p.fullName} size={48} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display text-[1rem] font-semibold text-ink">
                    {p.fullName}
                  </span>
                  <StatusBadge tone="info" size="sm" dot={false}>
                    {CATEGORIES.find((c) => c.id === p.category)?.label}
                  </StatusBadge>
                  {flags.data?.isMinor ? (
                    <StatusBadge tone="pending" size="sm" dot={false}>
                      Under 18
                    </StatusBadge>
                  ) : null}
                  {p.isBlocked ? (
                    <StatusBadge tone="failed" size="sm">
                      Blocked
                    </StatusBadge>
                  ) : null}
                </div>
                <p className="mt-1 text-[0.78rem] text-ink-muted">
                  {college?.name} · {p.department}, Year {p.yearOfStudy}
                </p>
                <p className="mt-0.5 font-mono text-[0.74rem] text-ink-muted">
                  {p.phone} · {p.email}
                </p>
              </div>
            </div>

            {flags.data ? (
              <div className="grid grid-cols-3 gap-2">
                <Stat label="Paid" value={inr(flags.data.amountPaid)} good />
                <Stat label="Due" value={inr(flags.data.amountDue)} good={flags.data.amountDue === 0} />
                <Stat
                  label="Events"
                  value={String((regs.data ?? []).filter((r) => r.status !== "cancelled").length)}
                  good
                />
              </div>
            ) : null}

            <NeoTabs
              value={tab}
              onChange={setTab}
              tabs={[
                { value: "profile", label: "Profile" },
                { value: "events", label: "Events", count: regs.data?.length },
                { value: "money", label: "Money", count: pays.data?.length },
                { value: "logistics", label: "Logistics" },
              ]}
            />

            {tab === "profile" ? (
              <div className="space-y-4">
                <div>
                  <SectionRule label="Identity" className="mb-2" />
                  <dl className="divide-y divide-hairline">
                    <KeyValue label="Participant code" value={p.code} mono />
                    <KeyValue label="Gender" value={titleCase(p.gender)} />
                    <KeyValue label="Date of birth" value={p.dateOfBirth} />
                    <KeyValue label="T-shirt size" value={p.tshirtSize} />
                    <KeyValue label="Dietary" value={titleCase(p.dietaryPref)} />
                    <KeyValue label="Registered via" value={titleCase(p.createdVia)} />
                    <KeyValue label="Registered" value={relativeTime(p.createdAt)} />
                  </dl>
                </div>
                <div>
                  <SectionRule label="Emergency contact" className="mb-2" />
                  <dl className="divide-y divide-hairline">
                    <KeyValue label="Name" value={p.emergencyName} />
                    <KeyValue label="Phone" value={p.emergencyPhone} mono />
                  </dl>
                </div>
                <div>
                  <SectionRule label="Contingent" className="mb-2" />
                  <dl className="divide-y divide-hairline">
                    <KeyValue label="College" value={college?.name ?? "—"} />
                    <KeyValue label="Contingent lead" value={college?.contactName ?? "—"} />
                    <KeyValue label="Lead phone" value={college?.contactPhone ?? "—"} mono />
                    <KeyValue label="Faculty escort" value={college?.facultyEscortName ?? "None"} />
                  </dl>
                </div>
                <div>
                  <SectionRule label="Documents" className="mb-2" />
                  {(docs.data ?? []).length === 0 ? (
                    <p className="text-[0.8rem] text-ink-muted">Nothing uploaded.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {(docs.data ?? []).map((d) => (
                        <li
                          key={d.id}
                          className="flex items-center gap-2 rounded-neo-sm bg-plane-alt px-2.5 py-2"
                        >
                          <span className="min-w-0 flex-1 truncate text-[0.8rem] text-ink-soft">
                            {DOC_TYPES.find((x) => x.id === d.docType)?.label ?? d.docType}
                          </span>
                          <StatusBadge tone={DOC_TONE[d.status]} size="sm">
                            {titleCase(d.status)}
                          </StatusBadge>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ) : null}

            {tab === "events" ? (
              <ul className="space-y-1.5">
                {(regs.data ?? []).map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center gap-2 rounded-neo-sm bg-plane-alt px-2.5 py-2"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.82rem] text-ink-soft">
                        {lookups.event(r.eventId)?.title}
                      </span>
                      <span className="block font-mono text-[0.7rem] text-ink-faint">{r.code}</span>
                    </span>
                    <span className="tnum text-[0.76rem] text-ink-muted">{inr(r.feeInr)}</span>
                    <StatusBadge tone={REGISTRATION_TONE[r.status]} size="sm">
                      {REGISTRATION_LABEL[r.status]}
                    </StatusBadge>
                  </li>
                ))}
                {!(regs.data ?? []).length ? (
                  <p className="py-8 text-center text-[0.85rem] text-ink-muted">
                    Not registered for any event.
                  </p>
                ) : null}
              </ul>
            ) : null}

            {tab === "money" ? (
              <div className="space-y-2">
                {(pays.data ?? []).map((pay) => (
                  <div key={pay.id} className="rounded-neo bg-plane-alt p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="tnum font-display text-[1rem] font-semibold text-ink">
                        {inr(pay.amount)}
                      </span>
                      <StatusBadge tone={PAYMENT_TONE[pay.status]} size="sm">
                        {PAYMENT_LABEL[pay.status]}
                      </StatusBadge>
                    </div>
                    <p className="mt-1 font-mono text-[0.72rem] text-ink-muted">
                      {titleCase(pay.method)}
                      {pay.utr ? ` · ${pay.utr}` : ""}
                      {pay.invoiceSerial ? ` · ${pay.invoiceSerial}` : ""}
                    </p>
                  </div>
                ))}
                {!(pays.data ?? []).length ? (
                  <p className="py-8 text-center text-[0.85rem] text-ink-muted">
                    No payment on record.
                  </p>
                ) : null}
              </div>
            ) : null}

            {tab === "logistics" ? (
              <div className="space-y-4">
                <div>
                  <SectionRule label="Accommodation" className="mb-2" />
                  {(acc.data ?? []).length === 0 ? (
                    <p className="text-[0.8rem] text-ink-muted">No request.</p>
                  ) : (
                    (acc.data ?? []).map((a) => {
                      const al = (allot.data ?? []).find((x) => x.requestId === a.id);
                      return (
                        <dl key={a.id} className="divide-y divide-hairline">
                          <KeyValue label="Nights" value={a.nights.join(", ").toUpperCase()} />
                          <KeyValue label="Amount" value={inr(a.amount)} />
                          <KeyValue
                            label="Status"
                            value={
                              <StatusBadge tone={ACCOMMODATION_TONE[a.status]} size="sm">
                                {titleCase(a.status)}
                              </StatusBadge>
                            }
                          />
                          {al ? (
                            <KeyValue label="Bed" value={`Room ${al.roomNo}, bed ${al.bedNo}`} />
                          ) : null}
                          {a.specialNeeds ? (
                            <KeyValue label="Special needs" value={a.specialNeeds} />
                          ) : null}
                        </dl>
                      );
                    })
                  )}
                </div>
                <div>
                  <SectionRule label="Travel" className="mb-2" />
                  {(travel.data ?? []).length === 0 ? (
                    <p className="text-[0.8rem] text-ink-muted">No travel details submitted.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {(travel.data ?? []).map((t) => (
                        <li key={t.id} className="rounded-neo-sm bg-plane-alt px-2.5 py-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[0.8rem] font-medium text-ink">
                              {titleCase(t.direction)}
                            </span>
                            <StatusBadge tone="info" size="sm" dot={false}>
                              {titleCase(t.mode)}
                            </StatusBadge>
                            {t.needsPickup ? (
                              <StatusBadge tone="pending" size="sm" dot={false}>
                                Needs pickup
                              </StatusBadge>
                            ) : null}
                          </div>
                          <p className="mt-0.5 text-[0.74rem] text-ink-muted">
                            {t.station} · {new Date(t.scheduledAt).toLocaleString("en-IN", {
                              day: "numeric",
                              month: "short",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                            {t.serviceRef ? ` · ${t.serviceRef}` : ""}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </NeoDrawer>

      <NeoModal
        open={eraseOpen}
        onOpenChange={setEraseOpen}
        title="Erase personal data"
        description="This anonymises the participant's name, email, phone and emergency contact. Financial records are retained but de-identified — an erasure request cannot delete an audited money trail."
        footer={
          <>
            <NeoButton variant="ghost" onClick={() => setEraseOpen(false)}>
              Cancel
            </NeoButton>
            <NeoButton
              variant="danger"
              icon={<ShieldOff />}
              onClick={async () => {
                if (!p) return;
                setEraseOpen(false);
                try {
                  await getRepo().participants.erase(p.id);
                  toast.success("Personal data erased", "Financial records retained, de-identified.");
                  onClose();
                  onChanged();
                } catch (e) {
                  toast.error(isDataError(e) ? e.message : "Erase failed");
                }
              }}
            >
              Erase permanently
            </NeoButton>
          </>
        }
      >
        <p className="text-[0.85rem] leading-relaxed text-ink-soft">
          This cannot be undone. Use it only on a verified erasure request from the participant
          themselves.
        </p>
      </NeoModal>
    </>
  );
}

function Stat({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div className="neo-inset-sm rounded-neo p-2.5 text-center">
      <div className="engraved mb-1 !text-[0.56rem]">{label}</div>
      <div
        className={`tnum font-display text-[0.95rem] font-semibold ${good ? "text-ink" : "text-failed"}`}
      >
        {value}
      </div>
    </div>
  );
}
