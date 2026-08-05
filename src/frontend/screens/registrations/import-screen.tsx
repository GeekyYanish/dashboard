"use client";

import { useRouter } from "next/navigation";

import { useState } from "react";
import { Upload, FileSpreadsheet, Download, CheckCheck, AlertTriangle } from "lucide-react";
import { Page, PageHeader, SubNav, StatGrid } from "@/frontend/components/page";
import {
  NeoCard,
  NeoButton,
  NeoStepper,
  StatusBadge,
  DataTable,
  EmptyState,
  toast,
  type Column,
} from "@/frontend/components/neo";
import { getRepo } from "@/lib/data";
import type { ImportPreview, ImportRow } from "@/lib/data/repository";
import { downloadCsv, parseCsv } from "@/lib/utils";
import { isDataError } from "@/lib/data/types";

/**
 * Colleges send contingent lists as spreadsheets. This is how they arrive, so
 * this is where most bad data enters — hence the mandatory dry run: nothing is
 * written until the operator has seen exactly what would change, row by row.
 */
export function ImportScreen() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null);

  const handleFile = async (file: File) => {
    setBusy(true);
    setFileName(file.name);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length < 2) throw new Error("File has no data rows");
      const p = await getRepo().registrations.previewImport(rows);
      setPreview(p);
      setStep(1);
    } catch (e) {
      toast.error("Could not read that file", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const res = await getRepo().registrations.commitImport(preview);
      setResult(res);
      setStep(2);
      toast.success(
        `Imported ${res.created} participants`,
        res.skipped ? `${res.skipped} rows skipped` : undefined,
      );
    } catch (e) {
      toast.error(isDataError(e) ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  const columns: Column<ImportRow>[] = [
    {
      key: "line",
      header: "Line",
      width: "56px",
      align: "right",
      sortValue: (r) => r.line,
      cell: (r) => <span className="tnum text-ink-faint">{r.line}</span>,
    },
    {
      key: "action",
      header: "Action",
      width: "96px",
      sortValue: (r) => r.action,
      cell: (r) => (
        <StatusBadge
          size="sm"
          tone={
            r.action === "create"
              ? "paid"
              : r.action === "update"
                ? "waitlist"
                : r.action === "error"
                  ? "failed"
                  : "neutral"
          }
        >
          {r.action}
        </StatusBadge>
      ),
    },
    {
      key: "name",
      header: "Name",
      sortValue: (r) => r.parsed.fullName ?? "",
      cell: (r) => <span className="font-medium text-ink">{r.parsed.fullName || "—"}</span>,
    },
    {
      key: "phone",
      header: "Phone",
      width: "130px",
      cell: (r) => <span className="font-mono text-[0.76rem] text-ink-muted">{r.parsed.phone}</span>,
    },
    {
      key: "events",
      header: "Events",
      width: "80px",
      align: "right",
      cell: (r) => <span className="tnum text-ink-muted">{r.parsed.eventSlugs?.length ?? 0}</span>,
    },
    {
      key: "messages",
      header: "Notes",
      cell: (r) =>
        r.messages.length ? (
          <span
            className={
              r.action === "error" ? "text-[0.76rem] text-failed" : "text-[0.76rem] text-ink-muted"
            }
          >
            {r.messages.join(" · ")}
          </span>
        ) : (
          <span className="text-[0.76rem] text-paid">Ready</span>
        ),
    },
  ];

  const template = () =>
    downloadCsv("aurora26-import-template.csv", [
      ["name", "email", "phone", "gender", "dob", "college", "department", "year", "category", "events"],
      [
        "Aditya Sharma",
        "aditya.sharma@example.com",
        "9876543210",
        "male",
        "2005-04-12",
        "NITK",
        "Computer Science",
        "3",
        "participant",
        "codeklash|hackathon-36",
      ],
    ]);

  return (
    <Page>
      <PageHeader
        title="Import registrations"
        description="Colleges send contingent lists as spreadsheets. Nothing is written until you have seen the dry run."
        actions={
          <NeoButton size="sm" variant="secondary" icon={<Download />} onClick={template}>
            Download template
          </NeoButton>
        }
      />

      <SubNav
        links={[
          { href: "/registrations", label: "All" },
          { href: "/registrations/waitlist", label: "Waitlist" },
          { href: "/registrations/duplicates", label: "Duplicates" },
          { href: "/registrations/clashes", label: "Clashes" },
          { href: "/registrations/import", label: "Import" },
        ]}
      />

      <NeoCard>
        <NeoCard.Raw className="pt-[var(--card-p)]">
          <NeoStepper
            current={step}
            onStepClick={(i) => i < step && setStep(i)}
            steps={[
              { label: "Upload", hint: "CSV from the college" },
              { label: "Dry run", hint: "Review every row" },
              { label: "Done", hint: "Committed" },
            ]}
          />
        </NeoCard.Raw>
      </NeoCard>

      {step === 0 ? (
        <NeoCard>
          <NeoCard.Body>
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-neo border-2 border-dashed border-engrave px-6 py-14 text-center transition-colors hover:border-signal">
              <span className="neo-inset mb-4 grid size-14 place-items-center rounded-full text-ink-faint">
                <Upload className="size-6" />
              </span>
              <span className="font-display text-[0.95rem] font-semibold text-ink">
                Drop a CSV here, or click to choose
              </span>
              <span className="mt-1.5 max-w-md text-[0.8rem] text-ink-muted">
                Expected columns: name, email, phone, gender, dob, college, department, year,
                category, events. Events are slugs separated by <code>|</code>.
              </span>
              <input
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </label>
          </NeoCard.Body>
        </NeoCard>
      ) : null}

      {step === 1 && preview ? (
        <>
          <StatGrid cols={4}>
            <SummaryTile label="Will create" value={preview.summary.create} tone="paid" />
            <SummaryTile label="Will update" value={preview.summary.update} tone="waitlist" />
            <SummaryTile label="Will skip" value={preview.summary.skip} tone="neutral" />
            <SummaryTile label="Errors" value={preview.summary.error} tone="failed" />
          </StatGrid>

          {preview.summary.error > 0 ? (
            <div className="flex items-start gap-2.5 rounded-neo bg-pending-bg p-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-pending" />
              <p className="text-[0.8rem] leading-snug text-ink-soft">
                <span className="font-semibold text-ink">
                  {preview.summary.error} rows will be skipped.
                </span>{" "}
                Export the error report, send it back to the college, and re-import the corrected
                file. Valid rows still import — you do not have to fix everything first.
              </p>
            </div>
          ) : null}

          <NeoCard>
            <NeoCard.Header
              eyebrow={fileName}
              title="Dry run"
              subtitle="Exactly what would change. Nothing has been written yet."
              icon={<FileSpreadsheet />}
              actions={
                <>
                  <NeoButton
                    size="sm"
                    variant="secondary"
                    icon={<Download />}
                    onClick={() =>
                      downloadCsv("import-errors.csv", [
                        ["Line", "Name", "Phone", "Problem"],
                        ...preview.rows
                          .filter((r) => r.action === "error")
                          .map((r) => [
                            r.line,
                            r.parsed.fullName ?? "",
                            r.parsed.phone ?? "",
                            r.messages.join("; "),
                          ]),
                      ])
                    }
                  >
                    Error report
                  </NeoButton>
                  <NeoButton
                    size="sm"
                    variant="primary"
                    icon={<CheckCheck />}
                    loading={busy}
                    onClick={commit}
                  >
                    Commit {preview.summary.create + preview.summary.update} rows
                  </NeoButton>
                </>
              }
            />
            <NeoCard.Body flush>
              <DataTable
                rows={preview.rows}
                columns={columns}
                rowKey={(r) => String(r.line)}
                pageSize={25}
              />
            </NeoCard.Body>
          </NeoCard>
        </>
      ) : null}

      {step === 2 && result ? (
        <NeoCard>
          <NeoCard.Body>
            <EmptyState
              icon={<CheckCheck />}
              title={`Imported ${result.created} participants`}
              hint={
                result.skipped
                  ? `${result.skipped} rows were skipped — download the error report from the previous step to send back to the college.`
                  : "Every row landed cleanly."
              }
              action={
                <div className="flex gap-2">
                  <NeoButton
                    variant="secondary"
                    onClick={() => {
                      setStep(0);
                      setPreview(null);
                      setResult(null);
                      setFileName("");
                    }}
                  >
                    Import another
                  </NeoButton>
                  <NeoButton
                    variant="primary"
                    onClick={() => router.push("/registrations")}
                  >
                    View registrations
                  </NeoButton>
                </div>
              }
            />
          </NeoCard.Body>
        </NeoCard>
      ) : null}
    </Page>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "paid" | "waitlist" | "neutral" | "failed";
}) {
  const cls = {
    paid: "text-paid",
    waitlist: "text-waitlist",
    neutral: "text-ink-muted",
    failed: "text-failed",
  }[tone];
  return (
    <div className="neo-raised rounded-neo-lg p-4">
      <div className="engraved mb-2">{label}</div>
      <div className={`tnum font-display text-[1.7rem] font-semibold leading-none ${cls}`}>
        {value}
      </div>
    </div>
  );
}
