"use client";

import { useMemo, useState } from "react";
import { Megaphone, Send, Mail, MessageSquare, Smartphone, Users, Plus } from "lucide-react";
import { Page, PageHeader, StatGrid } from "@/frontend/components/page";
import {
  NeoCard,
  NeoButton,
  DataTable,
  StatusBadge,
  NeoStatTile,
  EmptyState,
  NeoSegmented,
  NeoModal,
  NeoSelect,
  NeoInput,
  NeoTextarea,
  NeoCheckbox,
  KeyValue,
  SectionRule,
  NeoSkeleton,
  toast,
  type Column,
} from "@/frontend/components/neo";
import { useAsync } from "@/frontend/hooks/use-async";
import { useLookups } from "@/frontend/hooks/use-lookups";
import { getRepo } from "@/lib/data";
import { isDataError, type Broadcast, type MessageTemplate } from "@/lib/data/types";
import { CATEGORIES } from "@/lib/fest.config";
import { titleCase } from "@/frontend/status";
import { relativeTime } from "@/lib/utils";

const CHANNEL_ICON = { email: Mail, sms: Smartphone, whatsapp: MessageSquare } as const;

/**
 * Communications.
 *
 * The audience builder reuses the SAME filter shape as the registrations page,
 * which is the point: "everyone unpaid for more than a week" is a list the
 * team already knows how to describe, and it should not have to be described
 * twice in two different vocabularies.
 */
export function CommunicationsScreen() {
  const lookups = useLookups();
  const [view, setView] = useState<"broadcasts" | "templates" | "logs">("broadcasts");
  const [composeOpen, setComposeOpen] = useState(false);
  const [editTemplate, setEditTemplate] = useState<MessageTemplate | null>(null);

  const templates = useAsync(() => getRepo().comms.templates(), []);
  const broadcasts = useAsync(() => getRepo().comms.broadcasts(), []);
  const logs = useAsync(() => getRepo().comms.logs(), []);

  const stats = useMemo(() => {
    const b = broadcasts.data ?? [];
    const l = logs.data ?? [];
    return {
      sent: b.filter((x) => x.status === "sent").length,
      scheduled: b.filter((x) => x.status === "scheduled").length,
      delivered: l.filter((x) => x.status === "delivered").length,
      failed: l.filter((x) => x.status === "bounced" || x.status === "failed").length,
    };
  }, [broadcasts.data, logs.data]);

  const broadcastCols: Column<Broadcast>[] = [
    {
      key: "name",
      header: "Broadcast",
      sortValue: (b) => b.name,
      cell: (b) => {
        const Icon = CHANNEL_ICON[b.channel];
        return (
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="neo-inset-sm grid size-8 shrink-0 place-items-center rounded-neo-sm text-ink-faint">
              <Icon className="size-4" />
            </span>
            <div className="min-w-0">
              <div className="truncate font-medium text-ink">{b.name}</div>
              <div className="truncate text-[0.72rem] text-ink-muted">
                {templates.data?.find((t) => t.id === b.templateId)?.name ?? b.templateId}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      key: "audience",
      header: "Audience",
      width: "94px",
      align: "right",
      sortValue: (b) => b.audienceCount,
      cell: (b) => <span className="tnum text-ink-soft">{b.audienceCount.toLocaleString("en-IN")}</span>,
    },
    {
      key: "delivery",
      header: "Delivered",
      width: "128px",
      sortValue: (b) => b.sentCount,
      cell: (b) =>
        b.status === "sent" ? (
          <span className="tnum text-[0.78rem] text-ink-soft">
            {b.sentCount.toLocaleString("en-IN")}
            {b.failedCount ? <span className="text-failed"> · {b.failedCount} failed</span> : null}
          </span>
        ) : (
          <span className="text-ink-faint">—</span>
        ),
    },
    {
      key: "status",
      header: "Status",
      width: "112px",
      sortValue: (b) => b.status,
      cell: (b) => (
        <StatusBadge
          size="sm"
          tone={
            b.status === "sent"
              ? "paid"
              : b.status === "scheduled"
                ? "waitlist"
                : b.status === "failed"
                  ? "failed"
                  : "neutral"
          }
        >
          {titleCase(b.status)}
        </StatusBadge>
      ),
    },
    {
      key: "when",
      header: "When",
      width: "122px",
      hideBelow: "md",
      sortValue: (b) => b.sentAt ?? b.scheduledAt ?? "",
      cell: (b) => (
        <span className="text-[0.76rem] text-ink-muted">
          {b.sentAt
            ? relativeTime(b.sentAt)
            : b.scheduledAt
              ? `Scheduled ${relativeTime(b.scheduledAt)}`
              : "Draft"}
        </span>
      ),
    },
  ];

  return (
    <Page>
      <PageHeader
        title="Communications"
        description="Email, SMS and WhatsApp templates with merge fields, and an audience builder that speaks the same filter language as the registrations table."
        actions={
          <NeoButton size="sm" variant="primary" icon={<Send />} onClick={() => setComposeOpen(true)}>
            New broadcast
          </NeoButton>
        }
      />

      <StatGrid cols={4}>
        <NeoStatTile label="Broadcasts sent" value={stats.sent} icon={<Megaphone />} />
        <NeoStatTile label="Scheduled" value={stats.scheduled} icon={<Send />} />
        <NeoStatTile label="Messages delivered" value={stats.delivered.toLocaleString("en-IN")} />
        <NeoStatTile
          label="Bounced / failed"
          value={stats.failed.toLocaleString("en-IN")}
          deltaLabel="Bad numbers and dead inboxes"
        />
      </StatGrid>

      <NeoSegmented
        value={view}
        onChange={setView}
        options={[
          { value: "broadcasts", label: `Broadcasts (${broadcasts.data?.length ?? 0})` },
          { value: "templates", label: `Templates (${templates.data?.length ?? 0})` },
          { value: "logs", label: `Delivery log (${logs.data?.length ?? 0})` },
        ]}
      />

      {view === "broadcasts" ? (
        <NeoCard>
          <NeoCard.Body flush>
            <DataTable
              rows={broadcasts.data ?? []}
              columns={broadcastCols}
              rowKey={(b) => b.id}
              loading={broadcasts.loading}
              sort={{ key: "when", dir: "desc" }}
              pageSize={20}
              empty={<EmptyState icon={<Megaphone />} title="No broadcasts yet" />}
            />
          </NeoCard.Body>
        </NeoCard>
      ) : null}

      {view === "templates" ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(templates.data ?? []).map((t) => {
            const Icon = CHANNEL_ICON[t.channel];
            return (
              <NeoCard key={t.id}>
                <NeoCard.Header
                  eyebrow={t.channel}
                  title={t.name}
                  icon={<Icon />}
                  actions={
                    <NeoButton size="sm" variant="ghost" onClick={() => setEditTemplate(t)}>
                      Edit
                    </NeoButton>
                  }
                />
                <NeoCard.Body>
                  {t.subject ? (
                    <p className="mb-2 text-[0.8rem] font-semibold text-ink">{t.subject}</p>
                  ) : null}
                  <p className="line-clamp-4 whitespace-pre-wrap text-[0.78rem] leading-relaxed text-ink-muted">
                    {t.body}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {t.mergeFields.map((f) => (
                      <span
                        key={f}
                        className="rounded-full bg-neutral-bg px-2 py-0.5 font-mono text-[0.66rem] text-ink-muted"
                      >
                        {`{{${f}}}`}
                      </span>
                    ))}
                  </div>
                </NeoCard.Body>
              </NeoCard>
            );
          })}
          <button
            onClick={() =>
              setEditTemplate({
                id: `tpl-${Date.now()}`,
                name: "",
                channel: "email",
                subject: "",
                body: "",
                mergeFields: [],
                updatedAt: new Date().toISOString(),
              })
            }
            className="neo-inset grid min-h-[180px] place-items-center rounded-neo-lg border-2 border-dashed border-engrave text-ink-muted transition-colors hover:border-signal hover:text-ink"
          >
            <span className="flex flex-col items-center gap-2">
              <Plus className="size-6" />
              <span className="text-[0.85rem] font-medium">New template</span>
            </span>
          </button>
        </div>
      ) : null}

      {view === "logs" ? (
        <NeoCard>
          <NeoCard.Body flush>
            {logs.loading ? (
              <div className="p-4">
                <NeoSkeleton className="h-40" />
              </div>
            ) : (
              <DataTable
                rows={(logs.data ?? []).slice(0, 500)}
                columns={[
                  {
                    key: "who",
                    header: "Recipient",
                    cell: (l) => (
                      <span className="font-medium text-ink">
                        {lookups.participant(l.participantId)?.fullName ?? l.participantId}
                      </span>
                    ),
                  },
                  {
                    key: "channel",
                    header: "Channel",
                    width: "104px",
                    sortValue: (l) => l.channel,
                    cell: (l) => (
                      <span className="text-[0.78rem] text-ink-soft">{titleCase(l.channel)}</span>
                    ),
                  },
                  {
                    key: "subject",
                    header: "Subject",
                    hideBelow: "md",
                    cell: (l) => (
                      <span className="truncate text-[0.76rem] text-ink-muted">
                        {l.subject ?? "—"}
                      </span>
                    ),
                  },
                  {
                    key: "status",
                    header: "Status",
                    width: "110px",
                    sortValue: (l) => l.status,
                    cell: (l) => (
                      <StatusBadge
                        size="sm"
                        tone={
                          l.status === "delivered"
                            ? "paid"
                            : l.status === "bounced" || l.status === "failed"
                              ? "failed"
                              : "pending"
                        }
                      >
                        {titleCase(l.status)}
                      </StatusBadge>
                    ),
                  },
                  {
                    key: "sent",
                    header: "Sent",
                    width: "104px",
                    sortValue: (l) => l.sentAt,
                    cell: (l) => (
                      <span className="text-[0.76rem] text-ink-muted">{relativeTime(l.sentAt)}</span>
                    ),
                  },
                ]}
                rowKey={(l) => l.id}
                pageSize={30}
                empty={<EmptyState title="No messages sent yet" />}
              />
            )}
          </NeoCard.Body>
        </NeoCard>
      ) : null}

      <ComposeModal
        open={composeOpen}
        onOpenChange={setComposeOpen}
        templates={templates.data ?? []}
        onSent={() => {
          broadcasts.reload();
          logs.reload();
        }}
      />

      <TemplateModal
        // Keyed by template id so opening a different one remounts with fresh
        // draft state, instead of syncing props into state during render.
        key={editTemplate?.id ?? "none"}
        template={editTemplate}
        onClose={() => setEditTemplate(null)}
        onSaved={() => {
          templates.reload();
          setEditTemplate(null);
        }}
      />
    </Page>
  );
}

/* ------------------------------------------------------------------------- */

function ComposeModal({
  open,
  onOpenChange,
  templates,
  onSent,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  templates: MessageTemplate[];
  onSent: () => void;
}) {
  const [templateId, setTemplateId] = useState("");
  const [name, setName] = useState("");
  const [audience, setAudience] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);

  const preview = useAsync(
    () => (open ? getRepo().comms.previewAudience(audience) : Promise.resolve([])),
    [audience, open],
  );

  const toggle = (key: string, value: unknown) =>
    setAudience((a) => {
      const next = { ...a };
      if (next[key] !== undefined) delete next[key];
      else next[key] = value;
      return next;
    });

  return (
    <NeoModal
      open={open}
      onOpenChange={onOpenChange}
      title="New broadcast"
      description="Pick a template, describe the audience, and see the exact count before anything sends."
      size="lg"
      footer={
        <>
          <NeoButton variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </NeoButton>
          <NeoButton
            variant="primary"
            icon={<Send />}
            loading={busy}
            disabled={!templateId || !name.trim() || !preview.data?.length}
            onClick={async () => {
              setBusy(true);
              try {
                const b = await getRepo().comms.send({ templateId, name, audience });
                toast.success(
                  `Sent to ${b.audienceCount.toLocaleString("en-IN")} people`,
                  "Delivery results appear in the log.",
                );
                onOpenChange(false);
                setName("");
                setAudience({});
                setTemplateId("");
                onSent();
              } catch (e) {
                toast.error(isDataError(e) ? e.message : "Send failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            Send to {preview.data?.length ?? 0}
          </NeoButton>
        </>
      }
    >
      <div className="space-y-4">
        <NeoInput
          label="Broadcast name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Unpaid reminder — final week"
          hint="Internal only. Shows in the broadcast list and the audit log."
        />
        <NeoSelect
          label="Template"
          required
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          placeholder="Choose a template…"
          options={templates.map((t) => ({ value: t.id, label: `${t.name} · ${t.channel}` }))}
        />

        <div>
          <SectionRule label="Audience" className="mb-2.5" />
          <div className="space-y-2 rounded-neo bg-plane-alt p-3">
            <NeoCheckbox
              checked={audience.status !== undefined}
              onChange={() => toggle("status", ["confirmed"])}
              label="Confirmed registrations only"
            />
            <NeoCheckbox
              checked={audience.paymentStatus !== undefined}
              onChange={() => toggle("paymentStatus", ["pending"])}
              label="Payment still unverified"
            />
            <NeoCheckbox
              checked={audience.docsComplete !== undefined}
              onChange={() => toggle("docsComplete", false)}
              label="Documents incomplete"
            />
            <NeoCheckbox
              checked={audience.category !== undefined}
              onChange={() => toggle("category", "participant")}
              label={`Competitors only (${CATEGORIES[0].label})`}
            />
          </div>
        </div>

        <div className="neo-inset-sm flex items-center gap-3 rounded-neo p-3">
          <Users className="size-5 shrink-0 text-ink-faint" />
          <div className="min-w-0">
            <div className="tnum font-display text-[1.3rem] font-bold leading-none text-ink">
              {preview.loading ? "…" : (preview.data?.length ?? 0).toLocaleString("en-IN")}
            </div>
            <div className="engraved mt-1">people match</div>
          </div>
        </div>
      </div>
    </NeoModal>
  );
}

function TemplateModal({
  template,
  onClose,
  onSaved,
}: {
  template: MessageTemplate | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<MessageTemplate | null>(template);

  if (!draft) return null;

  return (
    <NeoModal
      open={!!template}
      onOpenChange={(v) => !v && onClose()}
      title={template?.name ? "Edit template" : "New template"}
      description="Merge fields in double braces are substituted per recipient at send time."
      size="lg"
      footer={
        <>
          <NeoButton variant="ghost" onClick={onClose}>
            Cancel
          </NeoButton>
          <NeoButton
            variant="primary"
            disabled={!draft.name.trim() || !draft.body.trim()}
            onClick={async () => {
              const fields = [...draft.body.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
              await getRepo().comms.saveTemplate({
                ...draft,
                mergeFields: [...new Set(fields)],
              });
              toast.success("Template saved");
              onSaved();
            }}
          >
            Save template
          </NeoButton>
        </>
      }
    >
      <div className="space-y-3">
        <NeoInput
          label="Name"
          required
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
        <NeoSelect
          label="Channel"
          value={draft.channel}
          onChange={(e) =>
            setDraft({ ...draft, channel: e.target.value as MessageTemplate["channel"] })
          }
          options={[
            { value: "email", label: "Email" },
            { value: "sms", label: "SMS" },
            { value: "whatsapp", label: "WhatsApp" },
          ]}
        />
        {draft.channel === "email" ? (
          <NeoInput
            label="Subject"
            value={draft.subject ?? ""}
            onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
          />
        ) : null}
        <NeoTextarea
          label="Body"
          required
          value={draft.body}
          onChange={(e) => setDraft({ ...draft, body: e.target.value })}
          className="[&_textarea]:min-h-[180px]"
          hint="Available: {{fullName}} {{code}} {{amountDue}} {{eventList}} {{missingDocs}} {{closeDate}}"
        />
      </div>
    </NeoModal>
  );
}
