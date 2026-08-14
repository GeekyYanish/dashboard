"use client";

import { useMemo, useState } from "react";
import {
  UserCog,
  ScrollText,
  CalendarClock,
  Download,
  ShieldCheck,
  Activity,
  Plus,
  Trash2,
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
  NeoSelect,
  NeoInput,
  NeoModal,
  toast,
  type Column,
} from "@/frontend/components/neo";
import { BarChart } from "@/frontend/components/charts";
import { useAsync } from "@/frontend/hooks/use-async";
import { useLookups } from "@/frontend/hooks/use-lookups";
import { getRepo } from "@/lib/data";
import { isDataError, type AuditEvent, type StaffMember } from "@/lib/data/types";
import { FEST, STAFF_ROLES, roleById } from "@/lib/fest.config";
import { titleCase } from "@/frontend/status";
import { downloadCsv, relativeTime } from "@/lib/utils";
import { useAuth } from "@/frontend/hooks/use-auth";
import type { StaffRoleId } from "@/lib/fest.config";

const CORE_STAFF_ROLES = STAFF_ROLES.filter((role) => ["head", "coordinator", "desk"].includes(role.id));

/* ==========================================================================
   Team & duty roster — the registration team managing itself.
   ========================================================================== */

export function TeamScreen() {
  const lookups = useLookups();
  const { role: actorRole } = useAuth();
  const [view, setView] = useState<"people" | "shifts" | "workload">("people");
  const staff = useAsync(() => getRepo().staff.list(), []);
  const workload = useAsync(() => getRepo().staff.workload(), []);
  const shifts = useAsync(() => getRepo().desk.shifts(), []);
  const events = useAsync(() => getRepo().events.list(), []);
  const [createOpen, setCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [newStaff, setNewStaff] = useState({ name: "", email: "", phone: "", temporaryPassword: "", role: "desk" as StaffRoleId, eventId: "" });
  const canManageStaff = actorRole === "head";

  const workloadMap = useMemo(
    () => new Map((workload.data ?? []).map((w) => [w.staffId, w])),
    [workload.data],
  );

  const cols: Column<StaffMember>[] = [
    {
      key: "name",
      header: "Member",
      sortValue: (s) => s.name,
      cell: (s) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <NeoAvatar name={s.name} size={30} />
          <div className="min-w-0">
            <div className="truncate font-medium text-ink">{s.name}</div>
            <div className="truncate text-[0.72rem] text-ink-muted">{s.email}</div>
          </div>
        </div>
      ),
    },
    {
      key: "role",
      header: "Role",
      width: "180px",
      sortValue: (s) => s.role,
      cell: (s) => (
        <div className="space-y-1.5">
          <NeoSelect
            value={s.role}
            disabled={!canManageStaff}
            onChange={async (e) => {
            try {
              await getRepo().staff.update(s.id, { role: e.target.value as StaffMember["role"] });
              toast.success("Role updated", `${s.name} is now ${roleById(e.target.value as never)?.label}`);
              staff.reload();
            } catch (err) {
              toast.error(
                isDataError(err) ? err.message : "Could not change role",
                isDataError(err) && err.code === "FORBIDDEN"
                  ? "Switch to the Registration Head in Settings to do this."
                  : undefined,
              );
              staff.reload();
            }
            }}
            options={CORE_STAFF_ROLES.map((r) => ({ value: r.id, label: r.label }))}
          />
          {s.assignments?.length ? (
            <div className="flex flex-wrap gap-1">
              {s.assignments.map((assignment) => (
                <span key={assignment.id} className="inline-flex items-center gap-1 rounded-full bg-plane-alt px-1.5 py-0.5 text-[0.65rem] text-ink-muted">
                  {roleById(assignment.role)?.label ?? assignment.role}
                  {assignment.eventId ? ` · ${events.data?.find((event) => event.id === assignment.eventId)?.title ?? "event"}` : " · global"}
                  {canManageStaff && getRepo().staff.revokeAssignment ? (
                    <button
                      type="button"
                      aria-label={`Revoke ${roleById(assignment.role)?.label ?? assignment.role} assignment`}
                      className="text-ink-faint hover:text-failed"
                      onClick={async () => {
                        try {
                          await getRepo().staff.revokeAssignment?.(s.id, assignment.id);
                          toast.success("Assignment revoked");
                          staff.reload();
                        } catch (err) {
                          toast.error(isDataError(err) ? err.message : "Could not revoke assignment");
                        }
                      }}
                    >
                      <Trash2 className="size-3" />
                    </button>
                  ) : null}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      key: "verif",
      header: "Verifications",
      width: "110px",
      align: "right",
      sortValue: (s) => workloadMap.get(s.id)?.verifications ?? 0,
      cell: (s) => (
        <span className="tnum text-ink-soft">{workloadMap.get(s.id)?.verifications ?? 0}</span>
      ),
    },
    {
      key: "walk",
      header: "Check-ins",
      width: "98px",
      align: "right",
      sortValue: (s) => workloadMap.get(s.id)?.walkIns ?? 0,
      cell: (s) => <span className="tnum text-ink-soft">{workloadMap.get(s.id)?.walkIns ?? 0}</span>,
    },
    {
      key: "tickets",
      header: "Tickets",
      width: "88px",
      align: "right",
      sortValue: (s) => workloadMap.get(s.id)?.tickets ?? 0,
      cell: (s) => <span className="tnum text-ink-soft">{workloadMap.get(s.id)?.tickets ?? 0}</span>,
    },
  ];

  /** Coverage grid — which desk is staffed when. Gaps are the point. */
  const coverage = useMemo(() => {
    const byDay = new Map<string, Map<string, StaffMember[]>>();
    for (const s of shifts.data ?? []) {
      const day = byDay.get(s.day) ?? new Map<string, StaffMember[]>();
      const desk = day.get(s.deskName) ?? [];
      const member = (staff.data ?? []).find((x) => x.id === s.staffId);
      if (member) desk.push(member);
      day.set(s.deskName, desk);
      byDay.set(s.day, day);
    }
    return byDay;
  }, [shifts.data, staff.data]);

  const desks = [...new Set((shifts.data ?? []).map((s) => s.deskName))];

  return (
    <Page>
      <PageHeader
        title="Team & duty roster"
        description="The registration team managing itself: who holds which role, who is on which desk, and how much each person has actually processed."
        actions={
          <div className="flex gap-2">
            {canManageStaff ? (
              <NeoButton size="sm" variant="primary" icon={<Plus />} onClick={() => { setCreateError(null); setCreateOpen(true); }}>
                Add staff
              </NeoButton>
            ) : null}
            <NeoButton
              size="sm"
              variant="secondary"
              icon={<Download />}
              onClick={() =>
                downloadCsv("team-workload.csv", [
                  ["Name", "Email", "Phone", "Role", "Verifications", "Check-ins", "Tickets resolved"],
                  ...(staff.data ?? []).map((s) => [
                    s.name, s.email, s.phone, s.role,
                    workloadMap.get(s.id)?.verifications ?? 0,
                    workloadMap.get(s.id)?.walkIns ?? 0,
                    workloadMap.get(s.id)?.tickets ?? 0,
                  ]),
                ])
              }
            >
              Export
            </NeoButton>
          </div>
        }
      />

      <StatGrid cols={4}>
        <NeoStatTile label="Team members" value={staff.data?.length ?? 0} icon={<UserCog />} />
        <NeoStatTile
          label="Desk volunteers"
          value={(staff.data ?? []).filter((s) => s.role === "desk").length}
        />
        <NeoStatTile label="Shifts scheduled" value={shifts.data?.length ?? 0} icon={<CalendarClock />} />
        <NeoStatTile
          label="Verifications done"
          value={(workload.data ?? []).reduce((s, w) => s + w.verifications, 0).toLocaleString("en-IN")}
          icon={<Activity />}
        />
      </StatGrid>

      <NeoSegmented
        value={view}
        onChange={setView}
        options={[
          { value: "people", label: "People & roles" },
          { value: "shifts", label: "Desk coverage" },
          { value: "workload", label: "Workload" },
        ]}
      />

      {view === "people" ? (
        <NeoCard>
          <NeoCard.Body flush>
            <DataTable
              rows={staff.data ?? []}
              columns={cols}
              rowKey={(s) => s.id}
              loading={staff.loading}
              pageSize={20}
              empty={<EmptyState icon={<UserCog />} title="No team members" />}
            />
          </NeoCard.Body>
        </NeoCard>
      ) : null}

      {view === "shifts" ? (
        <NeoCard>
          <NeoCard.Header
            eyebrow="Coverage"
            title="Desk roster"
            subtitle="An empty cell is a desk with nobody on it. That is what this grid is for."
            icon={<CalendarClock />}
          />
          <NeoCard.Body flush>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead className="bg-plane">
                  <tr className="border-b border-hairline">
                    <th className="engraved px-4 py-2.5 text-left">Desk</th>
                    {FEST.days.map((d) => (
                      <th key={d.key} className="engraved px-4 py-2.5 text-left">
                        {d.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {desks.map((desk) => (
                    <tr key={desk} className="border-b border-hairline">
                      <td className="px-4 py-3 text-[0.83rem] font-medium text-ink">{desk}</td>
                      {FEST.days.map((d) => {
                        const members = coverage.get(d.key)?.get(desk) ?? [];
                        return (
                          <td key={d.key} className="px-4 py-3">
                            {members.length ? (
                              <div className="flex flex-wrap gap-1.5">
                                {members.map((m, i) => (
                                  <span
                                    key={`${m.id}-${i}`}
                                    className="inline-flex items-center gap-1.5 rounded-full bg-plane-alt px-2 py-1"
                                  >
                                    <NeoAvatar name={m.name} size={18} />
                                    <span className="text-[0.72rem] text-ink-soft">
                                      {m.name.split(" ")[0]}
                                    </span>
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <StatusBadge tone="failed" size="sm" dot={false}>
                                Unstaffed
                              </StatusBadge>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </NeoCard.Body>
        </NeoCard>
      ) : null}

      {view === "workload" ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <NeoCard>
            <NeoCard.Header title="Payments verified" subtitle="Per team member." />
            <NeoCard.Raw>
              <BarChart
                horizontal
                data={(workload.data ?? [])
                  .map((w) => ({
                    label: lookups.staffMember(w.staffId)?.name ?? w.staffId,
                    value: w.verifications,
                    slot: 0,
                  }))
                  .sort((a, b) => b.value - a.value)}
              />
            </NeoCard.Raw>
          </NeoCard>
          <NeoCard>
            <NeoCard.Header title="Check-ins handled" subtitle="Desk and gate scans." />
            <NeoCard.Raw>
              <BarChart
                horizontal
                data={(workload.data ?? [])
                  .map((w) => ({
                    label: lookups.staffMember(w.staffId)?.name ?? w.staffId,
                    value: w.walkIns,
                    slot: 2,
                  }))
                  .sort((a, b) => b.value - a.value)}
              />
            </NeoCard.Raw>
          </NeoCard>
        </div>
      ) : null}

      <NeoModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Create staff account"
        description="The account is email-verified, starts with a temporary password, and must change it before console SSO is enabled."
        footer={
          <>
            <NeoButton variant="ghost" onClick={() => setCreateOpen(false)} disabled={createBusy}>Cancel</NeoButton>
            <NeoButton
              variant="primary"
              loading={createBusy}
              disabled={!newStaff.name.trim() || !newStaff.email.trim() || !newStaff.phone.trim() || newStaff.temporaryPassword.length < 8 || !getRepo().staff.create}
              onClick={async () => {
                const createStaff = getRepo().staff.create;
                if (!createStaff) return;
                setCreateBusy(true);
                setCreateError(null);
                try {
                  await createStaff({ ...newStaff, eventId: newStaff.role === "head" ? null : newStaff.eventId || events.data?.[0]?.id || null });
                  toast.success("Staff account created", "They must change the temporary password before console access.");
                  setCreateOpen(false);
                  setNewStaff({ name: "", email: "", phone: "", temporaryPassword: "", role: "desk", eventId: "" });
                  staff.reload();
                } catch (err) {
                  setCreateError(isDataError(err) ? err.message : "Could not create staff account.");
                } finally {
                  setCreateBusy(false);
                }
              }}
            >Create account</NeoButton>
          </>
        }
      >
        <div className="space-y-3">
          <NeoInput label="Full name" value={newStaff.name} onChange={(event) => setNewStaff((current) => ({ ...current, name: event.target.value }))} required />
          <NeoInput label="Email" type="email" value={newStaff.email} onChange={(event) => setNewStaff((current) => ({ ...current, email: event.target.value }))} required />
          <NeoInput label="Phone" value={newStaff.phone} onChange={(event) => setNewStaff((current) => ({ ...current, phone: event.target.value }))} required />
          <NeoInput label="Temporary password" type="password" hint="At least 8 characters" value={newStaff.temporaryPassword} onChange={(event) => setNewStaff((current) => ({ ...current, temporaryPassword: event.target.value }))} required />
          <NeoSelect label="Initial role" value={newStaff.role} onChange={(event) => setNewStaff((current) => ({ ...current, role: event.target.value as StaffRoleId, eventId: event.target.value === "head" ? "" : current.eventId }))} options={CORE_STAFF_ROLES.map((role) => ({ value: role.id, label: role.label }))} />
          {newStaff.role !== "head" ? <NeoSelect label="Assigned event" value={newStaff.eventId || events.data?.[0]?.id || ""} onChange={(event) => setNewStaff((current) => ({ ...current, eventId: event.target.value }))} options={(events.data ?? []).map((event) => ({ value: event.id, label: event.title }))} /> : null}
          {createError ? <p className="rounded-neo bg-failed-bg p-2.5 text-[0.78rem] text-failed" role="alert">{createError}</p> : null}
        </div>
      </NeoModal>
    </Page>
  );
}

/* ==========================================================================
   Audit log
   ========================================================================== */

export function AuditScreen() {
  const lookups = useLookups();
  const [entity, setEntity] = useState("");
  const [actorId, setActorId] = useState("");

  const events = useAsync(
    () =>
      getRepo().audit.list({
        entity: entity || undefined,
        actorId: actorId || undefined,
        limit: 500,
      }),
    [entity, actorId],
  );

  const cols: Column<AuditEvent>[] = [
    {
      key: "when",
      header: "When",
      width: "116px",
      sortValue: (a) => a.at,
      cell: (a) => <span className="text-[0.76rem] text-ink-muted">{relativeTime(a.at)}</span>,
    },
    {
      key: "actor",
      header: "Who",
      width: "170px",
      sortValue: (a) => a.actorName,
      cell: (a) => (
        <div className="flex min-w-0 items-center gap-2">
          <NeoAvatar name={a.actorName} size={24} />
          <span className="truncate text-[0.8rem] text-ink-soft">{a.actorName}</span>
        </div>
      ),
    },
    {
      key: "action",
      header: "Action",
      width: "190px",
      sortValue: (a) => a.action,
      cell: (a) => (
        <span className="font-mono text-[0.74rem] text-ink">{a.action}</span>
      ),
    },
    {
      key: "entity",
      header: "Entity",
      width: "134px",
      sortValue: (a) => a.entity,
      cell: (a) => (
        <div className="min-w-0">
          <div className="text-[0.78rem] text-ink-soft">{titleCase(a.entity)}</div>
          <div className="truncate font-mono text-[0.68rem] text-ink-faint">{a.entityId}</div>
        </div>
      ),
    },
    {
      key: "change",
      header: "Before → after",
      cell: (a) => (
        <span className="truncate font-mono text-[0.7rem] text-ink-muted">
          {a.before ? JSON.stringify(a.before) : "—"} → {a.after ? JSON.stringify(a.after) : "—"}
        </span>
      ),
    },
    {
      key: "note",
      header: "Note",
      hideBelow: "lg",
      cell: (a) => <span className="truncate text-[0.75rem] text-ink-muted">{a.note ?? "—"}</span>,
    },
  ];

  return (
    <Page>
      <PageHeader
        title="Audit log"
        description="Every mutation, immutable, newest first. When a dispute surfaces three weeks after the fest, this is the only thing that settles it."
        actions={
          <NeoButton
            size="sm"
            variant="secondary"
            icon={<Download />}
            onClick={() =>
              downloadCsv("audit-log.csv", [
                ["When", "Actor", "Action", "Entity", "Entity ID", "Before", "After", "Note"],
                ...(events.data ?? []).map((a) => [
                  a.at, a.actorName, a.action, a.entity, a.entityId,
                  JSON.stringify(a.before ?? ""), JSON.stringify(a.after ?? ""), a.note ?? "",
                ]),
              ])
            }
          >
            Export log
          </NeoButton>
        }
      />

      <StatGrid cols={3}>
        <NeoStatTile
          label="Events recorded"
          value={(events.data?.length ?? 0).toLocaleString("en-IN")}
          icon={<ScrollText />}
          deltaLabel="Most recent 500"
        />
        <NeoStatTile
          label="Distinct actors"
          value={new Set((events.data ?? []).map((a) => a.actorId)).size}
        />
        <NeoStatTile
          label="Money actions"
          value={
            (events.data ?? []).filter(
              (a) => a.entity === "payment" || a.entity === "refund" || a.entity === "shift",
            ).length
          }
          icon={<ShieldCheck />}
        />
      </StatGrid>

      <div className="flex flex-wrap gap-2">
        <NeoSelect
          value={entity}
          onChange={(e) => setEntity(e.target.value)}
          placeholder="All entities"
          className="w-52"
          options={[
            "payment", "registration", "participant", "refund", "allotment",
            "document", "team", "ticket", "certificate", "shift", "settlement",
          ].map((x) => ({ value: x, label: titleCase(x) }))}
        />
        <NeoSelect
          value={actorId}
          onChange={(e) => setActorId(e.target.value)}
          placeholder="All actors"
          className="w-52"
          options={lookups.staff.map((s) => ({ value: s.id, label: s.name }))}
        />
        {entity || actorId ? (
          <NeoButton
            size="md"
            variant="ghost"
            onClick={() => {
              setEntity("");
              setActorId("");
            }}
          >
            Clear
          </NeoButton>
        ) : null}
      </div>

      <NeoCard>
        <NeoCard.Body flush>
          <DataTable
            rows={events.data ?? []}
            columns={cols}
            rowKey={(a) => a.id}
            loading={events.loading}
            pageSize={40}
            empty={<EmptyState icon={<ScrollText />} title="Nothing logged for this filter" />}
          />
        </NeoCard.Body>
      </NeoCard>
    </Page>
  );
}
