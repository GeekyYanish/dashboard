"use client";

import { useMemo, useState } from "react";
import {
  Award,
  ShieldCheck,
  Ban,
  LifeBuoy,
  Download,
  Plus,
  Check,
  Copy,
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
  NeoModal,
  NeoSelect,
  NeoInput,
  NeoTextarea,
  KeyValue,
  SectionRule,
  toast,
  type Column,
} from "@/frontend/components/neo";
import { useAsync } from "@/frontend/hooks/use-async";
import { useLookups } from "@/frontend/hooks/use-lookups";
import { getRepo } from "@/lib/data";
import { isDataError, type CertificateIssue, type HelpdeskTicket } from "@/lib/data/types";
import { FEST } from "@/lib/fest.config";
import { PRIORITY_TONE, TICKET_TONE, titleCase } from "@/frontend/status";
import { downloadCsv, relativeTime } from "@/lib/utils";

/* ==========================================================================
   Certificates
   ========================================================================== */

const KINDS = [
  { value: "participation", label: "Participation" },
  { value: "winner", label: "Winner" },
  { value: "runner_up", label: "Runner-up" },
  { value: "special", label: "Special mention" },
  { value: "volunteer", label: "Volunteer" },
] as const;

export function CertificatesScreen() {
  const lookups = useLookups();
  const certs = useAsync(() => getRepo().certificates.list(), []);
  const attendance = useAsync(() => getRepo().attendance.list(), []);
  const [issueOpen, setIssueOpen] = useState(false);
  const [eventId, setEventId] = useState("");
  const [kind, setKind] = useState<CertificateIssue["kind"]>("participation");
  const [busy, setBusy] = useState(false);

  const eligible = useMemo(() => {
    if (!eventId) return [];
    const present = new Set(
      (attendance.data ?? []).filter((a) => a.eventId === eventId).map((a) => a.participantId),
    );
    return [...present];
  }, [attendance.data, eventId]);

  const cols: Column<CertificateIssue>[] = [
    {
      key: "serial",
      header: "Serial",
      width: "170px",
      sortValue: (c) => c.serial,
      cell: (c) => <span className="font-mono text-[0.74rem] text-ink-muted">{c.serial}</span>,
    },
    {
      key: "who",
      header: "Participant",
      sortValue: (c) => lookups.participant(c.participantId)?.fullName ?? "",
      cell: (c) => (
        <span className="font-medium text-ink">
          {lookups.participant(c.participantId)?.fullName ?? "—"}
        </span>
      ),
    },
    {
      key: "event",
      header: "Event",
      cell: (c) => (
        <span className="text-ink-soft">
          {c.eventId ? (lookups.event(c.eventId)?.title ?? "—") : "Fest-wide"}
        </span>
      ),
    },
    {
      key: "kind",
      header: "Kind",
      width: "126px",
      sortValue: (c) => c.kind,
      cell: (c) => (
        <StatusBadge tone={c.kind === "winner" ? "signal" : "info"} size="sm" dot={false}>
          {titleCase(c.kind)}
        </StatusBadge>
      ),
    },
    {
      key: "verify",
      header: "Verify link",
      width: "150px",
      hideBelow: "lg",
      cell: (c) => (
        <button
          onClick={() => {
            navigator.clipboard?.writeText(`${location.origin}/verify/${c.verifyToken}`);
            toast.success("Verify link copied");
          }}
          className="inline-flex items-center gap-1.5 font-mono text-[0.7rem] text-signal hover:underline"
        >
          <Copy className="size-3" />
          {c.verifyToken}
        </button>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: "104px",
      cell: (c) =>
        c.revokedAt ? (
          <StatusBadge tone="failed" size="sm">
            Revoked
          </StatusBadge>
        ) : (
          <StatusBadge tone="paid" size="sm">
            Valid
          </StatusBadge>
        ),
    },
    {
      key: "actions",
      header: "",
      width: "90px",
      align: "right",
      cell: (c) =>
        c.revokedAt ? null : (
          <NeoButton
            size="sm"
            variant="ghost"
            icon={<Ban />}
            onClick={async () => {
              await getRepo().certificates.revoke(c.id, "Issued in error");
              toast.success("Certificate revoked", "The public verify link now reports it invalid.");
              certs.reload();
            }}
          >
            Revoke
          </NeoButton>
        ),
    },
  ];

  return (
    <Page>
      <PageHeader
        title="Certificates"
        description="Issuance is gated on attendance — you cannot certify someone who never turned up. Every certificate carries a serial and a public verification token."
        actions={
          <>
            <NeoButton
              size="sm"
              variant="secondary"
              icon={<Download />}
              onClick={() =>
                downloadCsv("certificates.csv", [
                  ["Serial", "Participant", "Code", "Event", "Kind", "Issued", "Verify token", "Revoked"],
                  ...(certs.data ?? []).map((c) => {
                    const p = lookups.participant(c.participantId);
                    return [
                      c.serial, p?.fullName ?? "", p?.code ?? "",
                      c.eventId ? (lookups.event(c.eventId)?.title ?? "") : "Fest-wide",
                      c.kind, c.issuedAt, c.verifyToken, c.revokedAt ?? "",
                    ];
                  }),
                ])
              }
            >
              Export
            </NeoButton>
            <NeoButton size="sm" variant="primary" icon={<Plus />} onClick={() => setIssueOpen(true)}>
              Bulk issue
            </NeoButton>
          </>
        }
      />

      <StatGrid cols={3}>
        <NeoStatTile
          label="Issued"
          value={(certs.data ?? []).filter((c) => !c.revokedAt).length.toLocaleString("en-IN")}
          icon={<Award />}
        />
        <NeoStatTile
          label="Revoked"
          value={(certs.data ?? []).filter((c) => c.revokedAt).length}
          icon={<Ban />}
        />
        <NeoStatTile
          label="Serial series"
          value={FEST.serials.certificate}
          icon={<ShieldCheck />}
          deltaLabel="Sequential, gap-free"
        />
      </StatGrid>

      <NeoCard>
        <NeoCard.Body flush>
          <DataTable
            rows={certs.data ?? []}
            columns={cols}
            rowKey={(c) => c.id}
            loading={certs.loading}
            pageSize={25}
            empty={
              <EmptyState
                icon={<Award />}
                title="No certificates issued yet"
                hint="Issuance is gated on attendance, so nothing can be issued until the fest has run. Bulk-issue once an event's attendance is recorded."
                action={
                  <NeoButton variant="primary" icon={<Plus />} onClick={() => setIssueOpen(true)}>
                    Bulk issue
                  </NeoButton>
                }
              />
            }
          />
        </NeoCard.Body>
      </NeoCard>

      <NeoModal
        open={issueOpen}
        onOpenChange={setIssueOpen}
        title="Bulk issue certificates"
        description="Only participants with recorded attendance for the chosen event are eligible. Anyone already holding this certificate is skipped."
        footer={
          <>
            <NeoButton variant="ghost" onClick={() => setIssueOpen(false)}>
              Cancel
            </NeoButton>
            <NeoButton
              variant="primary"
              icon={<Award />}
              loading={busy}
              disabled={!eventId || !eligible.length}
              onClick={async () => {
                setBusy(true);
                try {
                  const res = await getRepo().certificates.issueBulk({
                    eventId,
                    kind,
                    participantIds: eligible,
                  });
                  toast.success(
                    `Issued ${res.issued} certificates`,
                    res.skipped.length ? `${res.skipped.length} skipped.` : undefined,
                  );
                  setIssueOpen(false);
                  certs.reload();
                } catch (e) {
                  toast.error(isDataError(e) ? e.message : "Issue failed");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Issue to {eligible.length}
            </NeoButton>
          </>
        }
      >
        <div className="space-y-3">
          <NeoSelect
            label="Event"
            required
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            placeholder="Choose an event…"
            options={lookups.events.map((e) => ({ value: e.id, label: e.title }))}
          />
          <NeoSelect
            label="Certificate kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as CertificateIssue["kind"])}
            options={KINDS.map((k) => ({ value: k.value, label: k.label }))}
          />
          <div className="neo-inset-sm rounded-neo p-3">
            <div className="engraved mb-1">Eligible</div>
            <div className="tnum font-display text-[1.4rem] font-bold text-ink">
              {eligible.length}
            </div>
            <p className="mt-1 text-[0.76rem] text-ink-muted">
              {eventId
                ? "Participants with recorded attendance for this event."
                : "Pick an event to see who qualifies."}
            </p>
          </div>
        </div>
      </NeoModal>
    </Page>
  );
}

/* ==========================================================================
   Helpdesk
   ========================================================================== */

const CATEGORIES_LIST = [
  { value: "payment_not_reflected", label: "Payment not reflected" },
  { value: "name_correction", label: "Name correction" },
  { value: "wrong_event", label: "Wrong event" },
  { value: "lost_badge", label: "Lost badge" },
  { value: "accommodation", label: "Accommodation" },
  { value: "travel", label: "Travel" },
  { value: "other", label: "Other" },
] as const;

export function HelpdeskScreen() {
  const lookups = useLookups();
  const tickets = useAsync(() => getRepo().helpdesk.list(), []);
  const [filter, setFilter] = useState<"open" | "all" | "resolved">("open");
  const [openTicket, setOpenTicket] = useState<HelpdeskTicket | null>(null);
  const [resolution, setResolution] = useState("");
  const [newOpen, setNewOpen] = useState(false);

  const rows = useMemo(() => {
    const t = tickets.data ?? [];
    if (filter === "open") return t.filter((x) => x.status !== "resolved" && x.status !== "closed");
    if (filter === "resolved") return t.filter((x) => x.status === "resolved" || x.status === "closed");
    return t;
  }, [tickets.data, filter]);

  const stats = useMemo(() => {
    const t = tickets.data ?? [];
    return {
      open: t.filter((x) => x.status !== "resolved" && x.status !== "closed").length,
      urgent: t.filter((x) => x.priority === "urgent" && x.status !== "resolved").length,
      resolved: t.filter((x) => x.status === "resolved" || x.status === "closed").length,
      unassigned: t.filter((x) => !x.assignedTo && x.status === "open").length,
    };
  }, [tickets.data]);

  const cols: Column<HelpdeskTicket>[] = [
    {
      key: "code",
      header: "Ticket",
      width: "92px",
      sortValue: (t) => t.code,
      cell: (t) => <span className="font-mono text-[0.74rem] text-ink-muted">{t.code}</span>,
    },
    {
      key: "subject",
      header: "Subject",
      sortValue: (t) => t.subject,
      cell: (t) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-ink">{t.subject}</div>
          <div className="truncate text-[0.72rem] text-ink-muted">
            {titleCase(t.category)}
            {t.participantId
              ? ` · ${lookups.participant(t.participantId)?.fullName ?? ""}`
              : ""}
          </div>
        </div>
      ),
    },
    {
      key: "priority",
      header: "Priority",
      width: "104px",
      sortValue: (t) => ["low", "normal", "high", "urgent"].indexOf(t.priority),
      cell: (t) => (
        <StatusBadge tone={PRIORITY_TONE[t.priority]} size="sm">
          {titleCase(t.priority)}
        </StatusBadge>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: "118px",
      sortValue: (t) => t.status,
      cell: (t) => (
        <StatusBadge tone={TICKET_TONE[t.status]} size="sm">
          {titleCase(t.status)}
        </StatusBadge>
      ),
    },
    {
      key: "assigned",
      header: "Assigned",
      width: "132px",
      hideBelow: "md",
      cell: (t) =>
        t.assignedTo ? (
          <div className="flex items-center gap-1.5">
            <NeoAvatar name={lookups.staffMember(t.assignedTo)?.name ?? "?"} size={22} />
            <span className="truncate text-[0.75rem] text-ink-muted">
              {lookups.staffMember(t.assignedTo)?.name}
            </span>
          </div>
        ) : (
          <StatusBadge tone="pending" size="sm" dot={false}>
            Unassigned
          </StatusBadge>
        ),
    },
    {
      key: "age",
      header: "Opened",
      width: "100px",
      sortValue: (t) => t.createdAt,
      cell: (t) => <span className="text-[0.76rem] text-ink-muted">{relativeTime(t.createdAt)}</span>,
    },
  ];

  return (
    <Page>
      <PageHeader
        title="Helpdesk"
        description="The problems that actually happen: payments not reflecting, misspelt badges, wrong events, lost lanyards, hostel swaps. Each ticket links to the participant record."
        actions={
          <NeoButton size="sm" variant="primary" icon={<Plus />} onClick={() => setNewOpen(true)}>
            New ticket
          </NeoButton>
        }
      />

      <StatGrid cols={4}>
        <NeoStatTile label="Open" value={stats.open} icon={<LifeBuoy />} />
        <NeoStatTile label="Urgent" value={stats.urgent} deltaLabel="Needs someone now" />
        <NeoStatTile label="Unassigned" value={stats.unassigned} deltaLabel="Nobody has picked these up" />
        <NeoStatTile label="Resolved" value={stats.resolved} icon={<Check />} />
      </StatGrid>

      <NeoSegmented
        value={filter}
        onChange={setFilter}
        options={[
          { value: "open", label: `Open (${stats.open})` },
          { value: "resolved", label: `Resolved (${stats.resolved})` },
          { value: "all", label: "All" },
        ]}
      />

      <NeoCard>
        <NeoCard.Body flush>
          <DataTable
            rows={rows}
            columns={cols}
            rowKey={(t) => t.id}
            loading={tickets.loading}
            onRowClick={(t) => {
              setOpenTicket(t);
              setResolution(t.resolutionNote ?? "");
            }}
            sort={{ key: "priority", dir: "desc" }}
            pageSize={25}
            empty={<EmptyState icon={<LifeBuoy />} title="No tickets" hint="Nothing needs attention." />}
          />
        </NeoCard.Body>
      </NeoCard>

      <NeoModal
        open={!!openTicket}
        onOpenChange={(v) => !v && setOpenTicket(null)}
        title={openTicket?.subject ?? ""}
        description={openTicket ? `${openTicket.code} · ${titleCase(openTicket.category)}` : ""}
        footer={
          openTicket && openTicket.status !== "resolved" && openTicket.status !== "closed" ? (
            <>
              <NeoButton
                variant="secondary"
                onClick={async () => {
                  const staff = lookups.staff[0];
                  await getRepo().helpdesk.update(openTicket.id, {
                    assignedTo: staff.id,
                    status: "in_progress",
                  });
                  toast.success("Assigned", staff.name);
                  setOpenTicket(null);
                  tickets.reload();
                }}
              >
                Assign to me
              </NeoButton>
              <NeoButton
                variant="primary"
                icon={<Check />}
                disabled={!resolution.trim()}
                onClick={async () => {
                  await getRepo().helpdesk.resolve(openTicket.id, resolution);
                  toast.success("Ticket resolved");
                  setOpenTicket(null);
                  tickets.reload();
                }}
              >
                Resolve
              </NeoButton>
            </>
          ) : null
        }
      >
        {openTicket ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              <StatusBadge tone={PRIORITY_TONE[openTicket.priority]} size="sm">
                {titleCase(openTicket.priority)}
              </StatusBadge>
              <StatusBadge tone={TICKET_TONE[openTicket.status]} size="sm">
                {titleCase(openTicket.status)}
              </StatusBadge>
            </div>
            <p className="rounded-neo bg-plane-alt p-3 text-[0.85rem] leading-relaxed text-ink-soft">
              {openTicket.body}
            </p>
            <dl className="divide-y divide-hairline">
              {openTicket.participantId ? (
                <KeyValue
                  label="Participant"
                  value={lookups.participant(openTicket.participantId)?.fullName ?? "—"}
                />
              ) : null}
              <KeyValue label="Opened" value={relativeTime(openTicket.createdAt)} />
              <KeyValue
                label="Assigned"
                value={lookups.staffMember(openTicket.assignedTo)?.name ?? "Nobody"}
              />
              {openTicket.resolvedAt ? (
                <KeyValue label="Resolved" value={relativeTime(openTicket.resolvedAt)} />
              ) : null}
            </dl>
            {openTicket.status !== "resolved" && openTicket.status !== "closed" ? (
              <NeoTextarea
                label="Resolution note"
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                placeholder="What was done, and what the participant was told."
              />
            ) : openTicket.resolutionNote ? (
              <div>
                <SectionRule label="Resolution" className="mb-2" />
                <p className="text-[0.82rem] text-ink-soft">{openTicket.resolutionNote}</p>
              </div>
            ) : null}
          </div>
        ) : null}
      </NeoModal>

      <NewTicketModal
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={() => {
          tickets.reload();
          setNewOpen(false);
        }}
      />
    </Page>
  );
}

function NewTicketModal({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<HelpdeskTicket["category"]>("other");
  const [priority, setPriority] = useState<HelpdeskTicket["priority"]>("normal");

  return (
    <NeoModal
      open={open}
      onOpenChange={onOpenChange}
      title="New ticket"
      description="Log what the participant reported, in their words where possible."
      footer={
        <>
          <NeoButton variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </NeoButton>
          <NeoButton
            variant="primary"
            disabled={!subject.trim()}
            onClick={async () => {
              await getRepo().helpdesk.create({
                participantId: null,
                category,
                subject,
                body: body || subject,
                priority,
                assignedTo: null,
              });
              toast.success("Ticket created");
              setSubject("");
              setBody("");
              onCreated();
            }}
          >
            Create ticket
          </NeoButton>
        </>
      }
    >
      <div className="space-y-3">
        <NeoInput
          label="Subject"
          required
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="One line — what is wrong"
        />
        <NeoSelect
          label="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value as HelpdeskTicket["category"])}
          options={CATEGORIES_LIST.map((c) => ({ value: c.value, label: c.label }))}
        />
        <NeoSelect
          label="Priority"
          value={priority}
          onChange={(e) => setPriority(e.target.value as HelpdeskTicket["priority"])}
          options={[
            { value: "low", label: "Low" },
            { value: "normal", label: "Normal" },
            { value: "high", label: "High" },
            { value: "urgent", label: "Urgent" },
          ]}
        />
        <NeoTextarea
          label="Details"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Anything the desk will need to resolve it."
        />
      </div>
    </NeoModal>
  );
}
