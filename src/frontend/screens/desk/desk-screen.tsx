"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Search,
  UserPlus,
  Banknote,
  Printer,
  Ticket,
  Package,
  WifiOff,
  Wifi,
  CloudUpload,
  ArrowLeft,
  Check,
  QrCode,
  Sun,
  Moon,
} from "lucide-react";
import {
  NeoCard,
  NeoButton,
  NeoIconButton,
  NeoSearchField,
  NeoInput,
  NeoSelect,
  NeoAvatar,
  StatusBadge,
  KeyValue,
  SectionRule,
  NeoModal,
  NeoSegmented,
  NeoCheckbox,
  Kbd,
  EmptyState,
  toast,
} from "@/frontend/components/neo";
import { BadgeSheet } from "./badge-sheet";
import { useAsync, useDebounced } from "@/frontend/hooks/use-async";
import { useLookups } from "@/frontend/hooks/use-lookups";
import { useOfflineQueue, useSimulatedOffline, type QueuedOp } from "@/frontend/hooks/use-offline-queue";
import { usePrefs } from "@/frontend/prefs";
import { getRepo } from "@/lib/data";
import { isDataError, type Participant } from "@/lib/data/types";
import { CATEGORIES, FEES, FEST, PAYMENT_METHODS, inr } from "@/lib/fest.config";
import { titleCase } from "@/frontend/status";
import { cn } from "@/lib/utils";

/**
 * THE DESK.
 *
 * Deliberately a different animal from the rest of the console: no sidebar, no
 * breadcrumbs, huge touch targets, function-key shortcuts. On fest morning
 * there is a queue of forty people and the volunteer operating this has been
 * awake since five. Every design choice here is about time-to-complete.
 */
export function DeskScreen() {
  const { theme, toggleTheme } = usePrefs();
  const lookups = useLookups();
  const [query, setQuery] = useState("");
  const dQuery = useDebounced(query, 160);
  const [selected, setSelected] = useState<Participant | null>(null);
  const [mode, setMode] = useState<"search" | "walkin">("search");
  const [payOpen, setPayOpen] = useState(false);
  const [kitOpen, setKitOpen] = useState(false);
  const [printFor, setPrintFor] = useState<Participant | null>(null);
  const { simOffline, setSimOffline } = useSimulatedOffline();

  const shift = useAsync(() => getRepo().desk.currentShift(), []);
  const tokens = useAsync(() => getRepo().desk.tokens(), []);

  // Offline queue — replays whatever was captured while the network was down.
  const flushOp = useCallback(async (op: QueuedOp) => {
    if (simOffline) throw new Error("offline");
    if (op.kind === "checkin") {
      const p = op.payload as { participantId: string };
      await getRepo().attendance.checkIn({ participantId: p.participantId, method: "manual" });
    }
  }, [simOffline]);
  const offline = useOfflineQueue(flushOp);

  const results = useAsync(
    () => (dQuery.trim().length >= 2 ? getRepo().participants.search(dQuery, 8) : Promise.resolve([])),
    [dQuery],
  );

  const flags = useAsync(
    () => (selected ? getRepo().participants.flags(selected.id) : Promise.resolve(null)),
    [selected],
  );
  const regs = useAsync(
    () => (selected ? getRepo().registrations.forParticipant(selected.id) : Promise.resolve([])),
    [selected],
  );

  // Declared before the key handler that calls it — a `const` arrow function
  // referenced above its declaration is a temporal-dead-zone hazard.
  const issueToken = async () => {
    const t = await getRepo().desk.issueToken("walk_in", shift.data?.deskName ?? "Main Gate Desk");
    toast.success(`Token ${t.number}`, "Handed to the next person in the queue.");
    tokens.reload();
  };

  // Function keys. Physical desks are driven by muscle memory.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        setMode("walkin");
      } else if (e.key === "F3" && selected) {
        e.preventDefault();
        setPayOpen(true);
      } else if (e.key === "F4" && selected) {
        e.preventDefault();
        setPrintFor(selected);
      } else if (e.key === "F8") {
        e.preventDefault();
        void issueToken();
      } else if (e.key === "Escape") {
        setSelected(null);
        setMode("search");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const waiting = useMemo(
    () => (tokens.data ?? []).filter((t) => !t.servedAt).length,
    [tokens.data],
  );

  const checkIn = async () => {
    if (!selected) return;
    if (simOffline) {
      offline.enqueue("checkin", `Check-in ${selected.fullName}`, { participantId: selected.id });
      toast.warning("Queued offline", "Will sync automatically when the network returns.");
      return;
    }
    try {
      const res = await getRepo().attendance.checkIn({
        participantId: selected.id,
        method: "manual",
      });
      if (res.wasAlready) toast.info("Already checked in", "No duplicate recorded.");
      else toast.success("Checked in", selected.fullName);
    } catch (e) {
      toast.error(isDataError(e) ? e.message : "Check-in failed");
    }
  };

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      {/* Desk chrome — minimal by design. */}
      <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b border-hairline bg-canvas px-4">
        <Link href="/" className="shrink-0">
          <NeoIconButton label="Back to console" size="sm" variant="ghost">
            <ArrowLeft />
          </NeoIconButton>
        </Link>
        <div className="min-w-0">
          <h1 className="truncate font-display text-[1.05rem] font-bold text-ink">
            {FEST.name}
            <span className="text-signal">{FEST.edition}</span> Desk
          </h1>
          <p className="engraved !text-[0.58rem]">
            {shift.data?.deskName ?? "No shift open"} ·{" "}
            {lookups.staffMember(shift.data?.staffId ?? null)?.name ?? "—"}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Pending-sync counter — always visible, never buried. */}
          {offline.pending > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-pending-bg px-3 py-1.5 text-[0.78rem] font-semibold text-pending">
              <CloudUpload className="size-3.5" />
              {offline.pending} queued
            </span>
          ) : null}

          <button
            onClick={() => setSimOffline((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.78rem] font-semibold transition-colors",
              simOffline ? "bg-failed-bg text-failed" : "bg-paid-bg text-paid",
            )}
            title="Simulate a network drop to see the offline path"
          >
            {simOffline ? <WifiOff className="size-3.5" /> : <Wifi className="size-3.5" />}
            {simOffline ? "Offline" : "Online"}
          </button>

          <div className="neo-inset-sm hidden items-baseline gap-2 rounded-neo px-3 py-1.5 sm:flex">
            <span className="engraved !text-[0.58rem]">Queue</span>
            <span className="tnum font-display text-[1rem] font-bold leading-none text-ink">
              {waiting}
            </span>
          </div>

          <NeoIconButton label="Toggle theme" size="sm" variant="ghost" onClick={toggleTheme}>
            {theme === "dark" ? <Sun /> : <Moon />}
          </NeoIconButton>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1200px] flex-1 p-4 sm:p-6">
        {/* Action rail — big keys, F-key labels. */}
        <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <DeskKey
            icon={<UserPlus />}
            label="New walk-in"
            hint="F2"
            active={mode === "walkin"}
            onClick={() => setMode("walkin")}
          />
          <DeskKey
            icon={<Banknote />}
            label="Collect payment"
            hint="F3"
            disabled={!selected}
            onClick={() => setPayOpen(true)}
          />
          <DeskKey
            icon={<Printer />}
            label="Print badge"
            hint="F4"
            disabled={!selected}
            onClick={() => setPrintFor(selected)}
          />
          <DeskKey icon={<Ticket />} label="Issue token" hint="F8" onClick={issueToken} />
        </div>

        {mode === "walkin" ? (
          <WalkInForm
            onCancel={() => setMode("search")}
            onCreated={(p) => {
              setSelected(p);
              setMode("search");
              lookups.reload();
            }}
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1fr_1.15fr]">
            {/* Search */}
            <NeoCard>
              <NeoCard.Header
                eyebrow="Find anyone in one keystroke"
                title="Search"
                subtitle="Name, registration code, phone number, or scan a badge QR."
                icon={<Search />}
              />
              <NeoCard.Raw>
                <NeoSearchField
                  size="lg"
                  autoFocus
                  value={query}
                  onValueChange={setQuery}
                  placeholder="Type a name, code or phone…"
                />

                <div className="mt-3 space-y-1.5">
                  {results.data?.length ? (
                    results.data.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setSelected(p)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-neo px-3 py-3 text-left transition-colors",
                          selected?.id === p.id ? "neo-pressed" : "bg-plane-alt hover:bg-plane",
                        )}
                      >
                        <NeoAvatar name={p.fullName} size={40} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[0.95rem] font-semibold text-ink">
                            {p.fullName}
                          </span>
                          <span className="block truncate font-mono text-[0.78rem] text-ink-muted">
                            {p.code} · {p.phone}
                          </span>
                        </span>
                        <span className="shrink-0 text-[0.78rem] text-ink-muted">
                          {lookups.college(p.collegeId)?.shortName}
                        </span>
                      </button>
                    ))
                  ) : dQuery.length >= 2 ? (
                    <EmptyState
                      icon={<Search />}
                      title="No match"
                      hint="Register them as a walk-in instead."
                      action={
                        <NeoButton variant="primary" icon={<UserPlus />} onClick={() => setMode("walkin")}>
                          New walk-in
                        </NeoButton>
                      }
                    />
                  ) : (
                    <div className="px-2 py-10 text-center">
                      <QrCode className="mx-auto mb-3 size-8 text-ink-faint" />
                      <p className="text-[0.85rem] text-ink-muted">
                        Start typing, or scan a badge.
                      </p>
                      <p className="mt-3 flex items-center justify-center gap-2 text-[0.75rem] text-ink-faint">
                        <Kbd>F2</Kbd> walk-in <Kbd>F3</Kbd> payment <Kbd>F4</Kbd> badge{" "}
                        <Kbd>F8</Kbd> token
                      </p>
                    </div>
                  )}
                </div>
              </NeoCard.Raw>
            </NeoCard>

            {/* Selected participant */}
            {selected ? (
              <NeoCard>
                <NeoCard.Header
                  eyebrow={selected.code}
                  title={selected.fullName}
                  subtitle={`${lookups.college(selected.collegeId)?.name} · ${selected.department}`}
                  actions={
                    <StatusBadge tone="info" size="sm" dot={false}>
                      {CATEGORIES.find((c) => c.id === selected.category)?.label}
                    </StatusBadge>
                  }
                />
                <NeoCard.Raw className="space-y-3">
                  {flags.data ? (
                    <div className="grid grid-cols-3 gap-2">
                      <BigStat label="Paid" value={inr(flags.data.amountPaid)} good />
                      <BigStat
                        label="Due"
                        value={inr(flags.data.amountDue)}
                        good={flags.data.amountDue === 0}
                      />
                      <BigStat
                        label="Docs"
                        value={flags.data.docsComplete ? "OK" : `${flags.data.missingDocs.length} short`}
                        good={flags.data.docsComplete}
                      />
                    </div>
                  ) : null}

                  {flags.data && !flags.data.docsComplete ? (
                    <div className="rounded-neo bg-pending-bg p-3 text-[0.8rem] leading-snug text-ink-soft">
                      <span className="font-semibold text-ink">Badge blocked.</span> Collect:{" "}
                      {flags.data.missingDocs.map((d) => titleCase(d)).join(", ")}.
                    </div>
                  ) : null}

                  <div>
                    <SectionRule label={`Events (${regs.data?.length ?? 0})`} className="mb-2" />
                    <ul className="space-y-1">
                      {(regs.data ?? []).slice(0, 6).map((r) => (
                        <li
                          key={r.id}
                          className="flex items-center gap-2 rounded-neo-sm bg-plane-alt px-2.5 py-1.5"
                        >
                          <span className="min-w-0 flex-1 truncate text-[0.8rem] text-ink-soft">
                            {lookups.event(r.eventId)?.title}
                          </span>
                          <span className="tnum text-[0.74rem] text-ink-muted">{inr(r.feeInr)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <NeoButton variant="secondary" icon={<Check />} onClick={checkIn}>
                      Check in
                    </NeoButton>
                    <NeoButton variant="secondary" icon={<Package />} onClick={() => setKitOpen(true)}>
                      Issue kit
                    </NeoButton>
                    <NeoButton
                      variant="secondary"
                      icon={<Banknote />}
                      onClick={() => setPayOpen(true)}
                      disabled={!flags.data?.amountDue}
                    >
                      Collect {flags.data ? inr(flags.data.amountDue) : ""}
                    </NeoButton>
                    <NeoButton
                      variant="primary"
                      icon={<Printer />}
                      onClick={() => setPrintFor(selected)}
                      disabled={!flags.data?.docsComplete}
                    >
                      Print badge
                    </NeoButton>
                  </div>
                </NeoCard.Raw>
              </NeoCard>
            ) : (
              <NeoCard>
                <NeoCard.Body>
                  <EmptyState
                    icon={<UserPlus />}
                    title="Nobody selected"
                    hint="Search for a participant, or press F2 to register a walk-in."
                  />
                </NeoCard.Body>
              </NeoCard>
            )}
          </div>
        )}
      </main>

      <CollectPaymentModal
        open={payOpen}
        onOpenChange={setPayOpen}
        participant={selected}
        amountDue={flags.data?.amountDue ?? 0}
        registrationIds={(regs.data ?? []).map((r) => r.id)}
        shiftId={shift.data?.id ?? null}
        onDone={() => {
          flags.reload();
          shift.reload();
        }}
      />

      <NeoModal
        open={kitOpen}
        onOpenChange={setKitOpen}
        title="Issue participant kit"
        description="T-shirt, lanyard, booklet and tote. One kit per participant — a second attempt is refused."
        footer={
          <>
            <NeoButton variant="ghost" onClick={() => setKitOpen(false)}>
              Cancel
            </NeoButton>
            <NeoButton
              variant="primary"
              icon={<Package />}
              onClick={async () => {
                if (!selected) return;
                setKitOpen(false);
                try {
                  await getRepo().desk.issueKit({
                    participantId: selected.id,
                    items: ["T-shirt", "ID lanyard", "Event booklet", "Tote bag"],
                    signature: true,
                  });
                  toast.success("Kit issued", `${selected.tshirtSize} t-shirt logged.`);
                } catch (e) {
                  toast.error(isDataError(e) ? e.message : "Could not issue kit");
                }
              }}
            >
              Issue kit
            </NeoButton>
          </>
        }
      >
        {selected ? (
          <dl className="divide-y divide-hairline">
            <KeyValue label="Participant" value={selected.fullName} />
            <KeyValue label="T-shirt size" value={selected.tshirtSize} />
            <KeyValue label="Contents" value="T-shirt, lanyard, booklet, tote" />
          </dl>
        ) : null}
      </NeoModal>

      <BadgeSheet
        participant={printFor}
        onClose={() => setPrintFor(null)}
        college={printFor ? lookups.college(printFor.collegeId)?.shortName : undefined}
      />
    </div>
  );
}

/* ------------------------------------------------------------------------- */

function DeskKey({
  icon,
  label,
  hint,
  onClick,
  disabled,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex flex-col items-center justify-center gap-1.5 rounded-neo-lg px-3 py-4 transition-all duration-200",
        "disabled:pointer-events-none disabled:opacity-40",
        active ? "neo-pressed text-signal" : "neo-raised text-ink-soft hover:-translate-y-0.5 hover:text-ink active:neo-pressed",
      )}
    >
      <span className="[&>svg]:size-6" aria-hidden>
        {icon}
      </span>
      <span className="text-[0.85rem] font-semibold">{label}</span>
      <Kbd>{hint}</Kbd>
    </button>
  );
}

function BigStat({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div className="neo-inset-sm rounded-neo p-3 text-center">
      <div className="engraved mb-1.5 !text-[0.56rem]">{label}</div>
      <div
        className={cn(
          "tnum font-display text-[1.05rem] font-bold leading-none",
          good ? "text-paid" : "text-failed",
        )}
      >
        {value}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- */

function WalkInForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (p: Participant) => void;
}) {
  const lookups = useLookups();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    fullName: "",
    phone: "",
    email: "",
    gender: "male",
    dateOfBirth: "2005-01-01",
    collegeId: "",
    department: "Computer Science",
    yearOfStudy: "2",
    category: "participant",
    tshirtSize: "M",
    emergencyName: "",
    emergencyPhone: "",
    dietaryPref: "veg",
  });

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const valid = form.fullName.trim().length > 2 && form.phone.replace(/\D/g, "").length >= 10 && form.collegeId;

  const submit = async () => {
    setBusy(true);
    try {
      const p = await getRepo().participants.create({
        fullName: form.fullName.trim(),
        email: form.email.trim() || `${form.phone.replace(/\D/g, "")}@walkin.local`,
        phone: form.phone,
        gender: form.gender as Participant["gender"],
        dateOfBirth: form.dateOfBirth,
        collegeId: form.collegeId,
        department: form.department,
        yearOfStudy: Number(form.yearOfStudy),
        category: form.category as Participant["category"],
        tshirtSize: form.tshirtSize as Participant["tshirtSize"],
        emergencyName: form.emergencyName,
        emergencyPhone: form.emergencyPhone,
        dietaryPref: form.dietaryPref as Participant["dietaryPref"],
        notes: "Registered at the desk",
        createdVia: "on_spot",
      });
      toast.success("Registered", `${p.fullName} · ${p.code}`);
      onCreated(p);
    } catch (e) {
      toast.error(
        isDataError(e) ? e.message : "Could not register",
        isDataError(e) && e.code === "DUPLICATE_PARTICIPANT"
          ? "Search for them instead — they are already in the system."
          : undefined,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <NeoCard>
      <NeoCard.Header
        eyebrow="Under 60 seconds"
        title="Walk-in registration"
        subtitle={`On-spot registrations carry a ${inr(FEES.onSpotSurcharge)} surcharge, applied automatically at payment.`}
        icon={<UserPlus />}
        actions={
          <NeoButton size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </NeoButton>
        }
      />
      <NeoCard.Raw>
        <div className="grid gap-3 sm:grid-cols-2">
          <NeoInput
            label="Full name"
            required
            autoFocus
            value={form.fullName}
            onChange={(e) => set("fullName")(e.target.value)}
            placeholder="As it should appear on the badge"
          />
          <NeoInput
            label="Phone"
            required
            mono
            value={form.phone}
            onChange={(e) => set("phone")(e.target.value)}
            placeholder="10-digit mobile"
            hint="Used to detect duplicates"
          />
          <NeoSelect
            label="College"
            required
            value={form.collegeId}
            onChange={(e) => set("collegeId")(e.target.value)}
            placeholder="Choose…"
            options={lookups.colleges.map((c) => ({ value: c.id, label: c.shortName }))}
          />
          <NeoSelect
            label="Category"
            value={form.category}
            onChange={(e) => set("category")(e.target.value)}
            options={CATEGORIES.map((c) => ({ value: c.id, label: `${c.label} · ${inr(c.baseFee)}` }))}
          />
          <NeoInput
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => set("email")(e.target.value)}
            placeholder="Optional at the desk"
          />
          <NeoInput
            label="Date of birth"
            type="date"
            value={form.dateOfBirth}
            onChange={(e) => set("dateOfBirth")(e.target.value)}
            hint="Under 18 needs guardian consent"
          />
          <NeoSelect
            label="Gender"
            value={form.gender}
            onChange={(e) => set("gender")(e.target.value)}
            options={[
              { value: "male", label: "Male" },
              { value: "female", label: "Female" },
              { value: "other", label: "Other" },
            ]}
          />
          <NeoSelect
            label="T-shirt"
            value={form.tshirtSize}
            onChange={(e) => set("tshirtSize")(e.target.value)}
            options={["XS", "S", "M", "L", "XL", "XXL"].map((s) => ({ value: s, label: s }))}
          />
          <NeoInput
            label="Department"
            value={form.department}
            onChange={(e) => set("department")(e.target.value)}
          />
          <NeoSelect
            label="Year"
            value={form.yearOfStudy}
            onChange={(e) => set("yearOfStudy")(e.target.value)}
            options={["1", "2", "3", "4"].map((y) => ({ value: y, label: `Year ${y}` }))}
          />
          <NeoInput
            label="Emergency contact"
            value={form.emergencyName}
            onChange={(e) => set("emergencyName")(e.target.value)}
            placeholder="Name and relation"
          />
          <NeoInput
            label="Emergency phone"
            mono
            value={form.emergencyPhone}
            onChange={(e) => set("emergencyPhone")(e.target.value)}
          />
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <NeoButton variant="ghost" onClick={onCancel}>
            Cancel
          </NeoButton>
          <NeoButton
            variant="primary"
            size="lg"
            icon={<UserPlus />}
            loading={busy}
            disabled={!valid}
            onClick={submit}
          >
            Register
          </NeoButton>
        </div>
      </NeoCard.Raw>
    </NeoCard>
  );
}

/* ------------------------------------------------------------------------- */

function CollectPaymentModal({
  open,
  onOpenChange,
  participant,
  amountDue,
  registrationIds,
  shiftId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  participant: Participant | null;
  amountDue: number;
  registrationIds: string[];
  shiftId: string | null;
  onDone: () => void;
}) {
  const [method, setMethod] = useState("cash");
  const [amount, setAmount] = useState("");
  const [utr, setUtr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount(String(amountDue));
      setUtr("");
      setMethod("cash");
    }
  }, [open, amountDue]);

  const needsUtr = PAYMENT_METHODS.find((m) => m.id === method)?.needsUtr;

  const submit = async () => {
    if (!participant) return;
    setBusy(true);
    try {
      const amt = Number(amount);
      await getRepo().payments.create({
        participantId: participant.id,
        registrationIds,
        method,
        utr: needsUtr ? utr : null,
        amount: amt,
        breakdown: [{ label: "Desk collection", kind: "base", refId: null, amount: amt }],
        deskShiftId: method === "cash" ? shiftId : null,
      });
      toast.success(
        `Collected ${inr(amt)}`,
        method === "cash" ? "Added to this shift's drawer." : "Queued for verification.",
      );
      onOpenChange(false);
      onDone();
    } catch (e) {
      toast.error(
        isDataError(e) ? e.message : "Could not record the payment",
        isDataError(e) && e.code === "UTR_ALREADY_USED"
          ? "That transaction reference has already been claimed."
          : undefined,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <NeoModal
      open={open}
      onOpenChange={onOpenChange}
      title="Collect payment"
      description={participant ? `${participant.fullName} · ${participant.code}` : ""}
      footer={
        <>
          <NeoButton variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </NeoButton>
          <NeoButton
            variant="primary"
            size="lg"
            icon={<Banknote />}
            loading={busy}
            disabled={!amount || Number(amount) <= 0 || (needsUtr && utr.length < 6)}
            onClick={submit}
          >
            Record {inr(Number(amount) || 0)}
          </NeoButton>
        </>
      }
    >
      <div className="space-y-4">
        <NeoSegmented
          fullWidth
          value={method}
          onChange={setMethod}
          options={PAYMENT_METHODS.map((m) => ({ value: m.id, label: m.label }))}
        />

        {method === "upi" ? (
          <div className="neo-inset flex flex-col items-center rounded-neo p-5 text-center">
            <div className="grid size-32 place-items-center rounded-neo bg-plane">
              <QrCode className="size-20 text-ink" />
            </div>
            <p className="mt-3 font-mono text-[0.85rem] font-semibold text-ink">
              {FEST.support.upiId}
            </p>
            <p className="mt-1 text-[0.75rem] text-ink-muted">
              Show this to the participant, then enter the UTR they read back.
            </p>
          </div>
        ) : null}

        <NeoInput
          label="Amount"
          type="number"
          mono
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          suffix="INR"
          hint={`Outstanding: ${inr(amountDue)}`}
        />

        {needsUtr ? (
          <NeoInput
            label="Transaction reference (UTR)"
            mono
            value={utr}
            onChange={(e) => setUtr(e.target.value)}
            placeholder="12-digit reference"
            hint="Rejected if this reference has already been used"
          />
        ) : (
          <div className="rounded-neo bg-plane-alt p-3 text-[0.8rem] leading-snug text-ink-muted">
            Cash goes straight into this shift&apos;s drawer and has to balance at handover.
          </div>
        )}
      </div>
    </NeoModal>
  );
}
