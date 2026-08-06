"use client";

import { useMemo, useState } from "react";
import { FileCheck2, Check, X, RotateCcw, FileWarning, Download, IdCard } from "lucide-react";
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
  NeoSkeleton,
  toast,
  type Column,
} from "@/frontend/components/neo";
import { GatedButton } from "@/frontend/components/gated";
import { useAsync } from "@/frontend/hooks/use-async";
import { useLookups } from "@/frontend/hooks/use-lookups";
import { getRepo } from "@/lib/data";
import { isDataError, type DocumentSubmission } from "@/lib/data/types";
import { DOC_TYPES } from "@/lib/fest.config";
import { DOC_TONE, titleCase } from "@/frontend/status";
import { downloadCsv, relativeTime } from "@/lib/utils";

/**
 * Document verification.
 *
 * Easy to forget when scoping, impossible to skip in practice: a national fest
 * cannot hand a badge to someone whose enrolment is unverified, and cannot put
 * a 17-year-old in a hostel without guardian consent. These are hard gates in
 * the data layer — accommodation.allot() refuses on DOCS_INCOMPLETE.
 */
export function DocumentsScreen() {
  const lookups = useLookups();
  const [view, setView] = useState<"queue" | "matrix">("queue");
  const [busy, setBusy] = useState<string | null>(null);

  const queue = useAsync(() => getRepo().documents.queue(), []);
  const all = useAsync(() => getRepo().documents.list(), []);
  const completeness = useAsync(() => getRepo().documents.completeness(), []);

  const stats = useMemo(() => {
    const d = all.data ?? [];
    const c = completeness.data ?? [];
    return {
      pending: d.filter((x) => x.status === "pending").length,
      approved: d.filter((x) => x.status === "approved").length,
      rejected: d.filter((x) => x.status === "rejected" || x.status === "resubmit").length,
      blocked: c.filter((x) => x.missing.length > 0).length,
    };
  }, [all.data, completeness.data]);

  const review = async (
    id: string,
    decision: "approved" | "rejected" | "resubmit",
    note?: string,
  ) => {
    setBusy(id);
    try {
      await getRepo().documents.review(id, decision, note);
      toast.success(
        decision === "approved"
          ? "Document approved"
          : decision === "rejected"
            ? "Document rejected"
            : "Re-upload requested",
      );
      queue.reload();
      all.reload();
      completeness.reload();
    } catch (e) {
      toast.error(isDataError(e) ? e.message : "Review failed");
    } finally {
      setBusy(null);
    }
  };

  const queueCols: Column<DocumentSubmission>[] = [
    {
      key: "who",
      header: "Participant",
      sortValue: (d) => lookups.participant(d.participantId)?.fullName ?? "",
      cell: (d) => {
        const p = lookups.participant(d.participantId);
        return (
          <div className="flex min-w-0 items-center gap-2.5">
            <NeoAvatar name={p?.fullName ?? "?"} size={28} />
            <div className="min-w-0">
              <div className="truncate font-medium text-ink">{p?.fullName ?? "Unknown"}</div>
              <div className="truncate font-mono text-[0.72rem] text-ink-muted">{p?.code}</div>
            </div>
          </div>
        );
      },
    },
    {
      key: "type",
      header: "Document",
      sortValue: (d) => d.docType,
      cell: (d) => {
        const t = DOC_TYPES.find((x) => x.id === d.docType);
        return (
          <div className="min-w-0">
            <div className="truncate text-ink-soft">{t?.label ?? d.docType}</div>
            <div className="truncate font-mono text-[0.7rem] text-ink-faint">{d.fileName}</div>
          </div>
        );
      },
    },
    {
      key: "gates",
      header: "Gates",
      width: "138px",
      hideBelow: "md",
      cell: (d) => {
        const gates = DOC_TYPES.find((x) => x.id === d.docType)?.gates ?? [];
        return gates.length ? (
          <div className="flex flex-wrap gap-1">
            {(gates as readonly string[]).map((g) => (
              <StatusBadge key={g} tone="neutral" size="sm" dot={false}>
                {g}
              </StatusBadge>
            ))}
          </div>
        ) : (
          <span className="text-ink-faint">—</span>
        );
      },
    },
    {
      key: "submitted",
      header: "Waiting",
      width: "96px",
      sortValue: (d) => d.submittedAt,
      cell: (d) => (
        <span className="text-[0.76rem] text-ink-muted">{relativeTime(d.submittedAt)}</span>
      ),
    },
    {
      key: "actions",
      header: "",
      width: "200px",
      align: "right",
      cell: (d) => (
        <div className="flex justify-end gap-1.5">
          <NeoButton
            size="sm"
            variant="ghost"
            icon={<RotateCcw />}
            loading={busy === d.id}
            onClick={() => review(d.id, "resubmit", "Please upload a clearer scan")}
          >
            <span className="sr-only">Request re-upload</span>
          </NeoButton>
          <GatedButton
            capability="documents.review"
            size="sm"
            variant="secondary"
            icon={<X />}
            loading={busy === d.id}
            onClick={() => review(d.id, "rejected", "Does not meet requirements")}
          >
            Reject
          </GatedButton>
          <GatedButton
            capability="documents.review"
            size="sm"
            variant="primary"
            icon={<Check />}
            loading={busy === d.id}
            onClick={() => review(d.id, "approved")}
          >
            Approve
          </GatedButton>
        </div>
      ),
    },
  ];

  /** Per-participant completeness — who is blocked, and on what. */
  const matrixRows = useMemo(
    () => (completeness.data ?? []).filter((c) => c.missing.length > 0).slice(0, 800),
    [completeness.data],
  );

  type MatrixRow = (typeof matrixRows)[number];
  const matrixCols: Column<MatrixRow>[] = [
    {
      key: "who",
      header: "Participant",
      sortValue: (r) => lookups.participant(r.participantId)?.fullName ?? "",
      cell: (r) => {
        const p = lookups.participant(r.participantId);
        return (
          <div className="min-w-0">
            <div className="truncate font-medium text-ink">{p?.fullName ?? "Unknown"}</div>
            <div className="truncate text-[0.72rem] text-ink-muted">
              {lookups.college(p?.collegeId ?? "")?.shortName}
            </div>
          </div>
        );
      },
    },
    {
      key: "required",
      header: "Required",
      width: "90px",
      align: "right",
      sortValue: (r) => r.required.length,
      cell: (r) => <span className="tnum text-ink-muted">{r.required.length}</span>,
    },
    {
      key: "approved",
      header: "Approved",
      width: "90px",
      align: "right",
      sortValue: (r) => r.approved.length,
      cell: (r) => <span className="tnum text-paid">{r.approved.length}</span>,
    },
    {
      key: "missing",
      header: "Missing",
      sortValue: (r) => r.missing.length,
      cell: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.missing.map((m) => (
            <StatusBadge key={m} tone="failed" size="sm" dot={false}>
              {DOC_TYPES.find((x) => x.id === m)?.label ?? m}
            </StatusBadge>
          ))}
        </div>
      ),
    },
  ];

  return (
    <Page>
      <PageHeader
        title="Document verification"
        description="College ID, bonafide certificate, guardian consent for anyone under 18, indemnity waivers for sports, and government ID for hostel check-in. Badges and beds are gated on these."
        actions={
          <NeoButton
            size="sm"
            variant="secondary"
            icon={<Download />}
            onClick={() =>
              downloadCsv("document-gaps.csv", [
                ["Participant", "Code", "College", "Required", "Approved", "Missing"],
                ...matrixRows.map((r) => {
                  const p = lookups.participant(r.participantId);
                  return [
                    p?.fullName ?? "",
                    p?.code ?? "",
                    lookups.college(p?.collegeId ?? "")?.name ?? "",
                    r.required.join("; "),
                    r.approved.join("; "),
                    r.missing.join("; "),
                  ];
                }),
              ])
            }
          >
            Export gaps
          </NeoButton>
        }
      />

      <StatGrid cols={4}>
        <NeoStatTile
          label="Awaiting review"
          value={stats.pending.toLocaleString("en-IN")}
          icon={<FileCheck2 />}
        />
        <NeoStatTile label="Approved" value={stats.approved.toLocaleString("en-IN")} icon={<Check />} />
        <NeoStatTile
          label="Rejected / re-upload"
          value={stats.rejected.toLocaleString("en-IN")}
          icon={<RotateCcw />}
        />
        <NeoStatTile
          label="Participants blocked"
          value={stats.blocked.toLocaleString("en-IN")}
          icon={<FileWarning />}
          deltaLabel="Cannot be issued a badge"
        />
      </StatGrid>

      <NeoSegmented
        value={view}
        onChange={setView}
        options={[
          { value: "queue", label: `Review queue (${stats.pending})` },
          { value: "matrix", label: `Blocked participants (${stats.blocked})` },
        ]}
      />

      <NeoCard>
        <NeoCard.Header
          eyebrow={view === "queue" ? "Oldest first" : "Completeness"}
          title={view === "queue" ? "Documents awaiting review" : "Who is missing what"}
          subtitle={
            view === "queue"
              ? "Approving a document may unblock a badge or a hostel bed immediately."
              : "Every participant below is short at least one required document."
          }
          icon={view === "queue" ? <FileCheck2 /> : <IdCard />}
        />
        <NeoCard.Body flush>
          {queue.loading || completeness.loading ? (
            <div className="p-4">
              <NeoSkeleton className="h-48" />
            </div>
          ) : view === "queue" ? (
            <DataTable
              rows={queue.data ?? []}
              columns={queueCols}
              rowKey={(d) => d.id}
              pageSize={20}
              empty={
                <EmptyState
                  icon={<Check />}
                  title="Review queue is clear"
                  hint="Every submitted document has been looked at."
                />
              }
            />
          ) : (
            <DataTable
              rows={matrixRows}
              columns={matrixCols}
              rowKey={(r) => r.participantId}
              sort={{ key: "missing", dir: "desc" }}
              pageSize={25}
              empty={
                <EmptyState title="Everyone is document-complete" hint="No badge is blocked." />
              }
            />
          )}
        </NeoCard.Body>
        {view === "matrix" && (completeness.data ?? []).filter((c) => c.missing.length).length > 800 ? (
          <NeoCard.Footer>
            <span>
              Showing the first 800 of{" "}
              {(completeness.data ?? []).filter((c) => c.missing.length).length} blocked
              participants — export for the full list.
            </span>
          </NeoCard.Footer>
        ) : null}
      </NeoCard>
    </Page>
  );
}
