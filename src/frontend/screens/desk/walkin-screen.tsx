"use client";

import { useState } from "react";
import { UserPlus, Search, Ticket, IndianRupee, CheckCircle2 } from "lucide-react";
import {
  NeoCard,
  NeoButton,
  NeoInput,
  NeoSelect,
  StatusBadge,
  SectionRule,
  toast,
} from "@/frontend/components/neo";
import { useAsync } from "@/frontend/hooks/use-async";
import { useLookups } from "@/frontend/hooks/use-lookups";
import { getRepo } from "@/lib/data";
import { isDataError, type Participant, type FestEvent } from "@/lib/data/types";
import { PAYMENT_METHODS, inr } from "@/lib/fest.config";

/**
 * On-spot walk-in registration.
 *
 * Deliberately not the full kiosk in desk-screen.tsx. That one also runs queue
 * tokens, kit issue and a cash drawer, none of which have a backend — it stays
 * for the offline demo. This is the path that exists live: find or create the
 * person, enrol them, take the money.
 *
 * The three steps are separate calls that each stand on their own, so a
 * failure part-way leaves something usable rather than a half-registration:
 * the participant exists even if enrolment fails, and they are enrolled even
 * if payment is not yet taken.
 */
export function WalkInScreen() {
  const events = useAsync(() => getRepo().events.list(), []);
  const tiers = useAsync(() => getRepo().payments.entryPassTiers(), []);
  const lookups = useLookups();
  const courses = useAsync(() => getRepo().colleges.courses(), []);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Participant[] | null>(null);
  const [person, setPerson] = useState<Participant | null>(null);
  const [busy, setBusy] = useState(false);

  const [draft, setDraft] = useState({
    fullName: "", email: "", phone: "", collegeId: "", customCollegeName: "",
    department: "", yearOfStudy: "", gender: "other", dateOfBirth: "",
    tshirtSize: "M", dietaryPref: "veg", emergencyName: "", emergencyPhone: "",
  });
  const [eventId, setEventId] = useState("");
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [enrolled, setEnrolled] = useState<string[]>([]);
  const [paid, setPaid] = useState<number | null>(null);

  function reset() {
    setPerson(null); setResults(null); setQuery("");
    setDraft({
      fullName: "", email: "", phone: "", collegeId: "", customCollegeName: "",
      department: "", yearOfStudy: "", gender: "other", dateOfBirth: "",
      tshirtSize: "M", dietaryPref: "veg", emergencyName: "", emergencyPhone: "",
    });
    setEventId(""); setReference(""); setEnrolled([]); setPaid(null);
  }

  async function search() {
    if (!query.trim()) return;
    setBusy(true);
    try {
      setResults(await getRepo().participants.search(query.trim(), 10));
    } catch (e) {
      toast.error(isDataError(e) ? e.message : "Search failed");
    } finally { setBusy(false); }
  }

  async function createPerson() {
    setBusy(true);
    try {
      const created = await getRepo().participants.create({
        fullName: draft.fullName.trim(),
        email: draft.email.trim(),
        phone: draft.phone.trim(),
        gender: draft.gender as Participant["gender"],
        dateOfBirth: draft.dateOfBirth,
        collegeId: draft.collegeId,
        department: draft.department,
        yearOfStudy: Number(draft.yearOfStudy) || 0,
        category: "participant",
        tshirtSize: draft.tshirtSize as Participant["tshirtSize"],
        emergencyName: draft.emergencyName,
        emergencyPhone: draft.emergencyPhone,
        dietaryPref: draft.dietaryPref as Participant["dietaryPref"],
        notes: null,
        createdVia: "on_spot",
      } as Omit<Participant, "id" | "code" | "createdAt" | "isBlocked">);
      setPerson(created);
      toast.success("Participant created", created.code);
    } catch (e) {
      toast.error(isDataError(e) ? e.message : "Could not create the participant");
    } finally { setBusy(false); }
  }

  async function enrol() {
    if (!person || !eventId) return;
    setBusy(true);
    try {
      const reg = await getRepo().registrations.create({ participantId: person.id, eventId, source: "on_spot" });
      setEnrolled((current) => [...current, reg.code]);
      setEventId("");
      toast.success("Registered", reg.code);
    } catch (e) {
      toast.error(isDataError(e) ? e.message : "Could not register");
    } finally { setBusy(false); }
  }

  async function takePayment() {
    if (!person) return;
    setBusy(true);
    try {
      const payment = await getRepo().payments.create({
        participantId: person.id, method, utr: reference.trim() || null,
      } as Parameters<ReturnType<typeof getRepo>["payments"]["create"]>[0]);
      setPaid(payment.amount);
      toast.success(`Collected ${inr(payment.amount)}`, "Queued for verification.");
    } catch (e) {
      toast.error(isDataError(e) ? e.message : "Could not record the payment");
    } finally { setBusy(false); }
  }

  const current = tiers.data?.find((t) => {
    const today = new Date().toISOString().slice(0, 10);
    return t.id !== "christite" && t.id !== "international" && today >= t.from && today <= t.to;
  });

  return (
    <div className="mx-auto grid max-w-5xl gap-4 p-4 lg:grid-cols-2">
      <NeoCard className="lg:col-span-2">
        <NeoCard.Header
          eyebrow="Desk"
          title="Walk-in registration"
          subtitle={current ? `Today's entry pass: ${current.label} · ${inr(current.amountInr)}. Christites pay ₹200, international entrants ₹1,000.` : undefined}
          actions={person ? <NeoButton size="sm" variant="ghost" onClick={reset}>Start over</NeoButton> : undefined}
        />
      </NeoCard>

      {/* 1 — who is at the desk */}
      <NeoCard className="lg:col-span-2">
        <NeoCard.Header eyebrow="Step 1" title="Find or add the person" />
        <NeoCard.Body className="space-y-3">
          {person ? (
            <div className="rounded-neo border border-engrave p-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-paid" />
                <span className="text-[0.9rem] font-semibold text-ink">{person.fullName}</span>
                <StatusBadge tone="info" size="sm" dot={false}>{person.code}</StatusBadge>
              </div>
              <p className="mt-1 text-[0.76rem] text-ink-muted">{person.email}</p>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <NeoInput
                  label="Search existing"
                  placeholder="Name, code, phone or email"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void search(); }}
                  className="flex-1"
                />
                <NeoButton className="self-end" icon={<Search />} onClick={search} disabled={busy || !query.trim()}>
                  Search
                </NeoButton>
              </div>

              {results?.length ? (
                <ul className="divide-y divide-hairline rounded-neo border border-engrave">
                  {results.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => setPerson(r)}
                        className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-raised"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[0.83rem] text-ink">{r.fullName}</span>
                          <span className="block truncate text-[0.72rem] text-ink-muted">{r.email}</span>
                        </span>
                        <span className="font-mono text-[0.72rem] text-ink-faint">{r.code}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : results ? (
                <p className="text-[0.78rem] text-ink-muted">Nobody matched — add them below.</p>
              ) : null}

              <SectionRule label="Or add a new one" />
              <div className="grid gap-3 sm:grid-cols-2">
                <NeoInput
                  label="Full name"
                  required
                  value={draft.fullName}
                  onChange={(e) => setDraft((d) => ({ ...d, fullName: e.target.value }))}
                  placeholder="As it should appear on the badge"
                />
                <NeoInput
                  label="Phone"
                  mono
                  value={draft.phone}
                  onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
                  placeholder="10-digit mobile"
                  hint="Used to detect duplicates"
                />
                {/* Required, unlike the old kiosk which allowed a blank. The
                    account is keyed on email and users.email is NOT NULL. */}
                <NeoInput
                  label="Email"
                  type="email"
                  required
                  value={draft.email}
                  onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
                  hint="The account is keyed on this"
                />
                <NeoInput
                  label="Date of birth"
                  type="date"
                  value={draft.dateOfBirth}
                  onChange={(e) => setDraft((d) => ({ ...d, dateOfBirth: e.target.value }))}
                  hint="Under 18 needs guardian consent"
                />
                <NeoSelect
                  label="College"
                  value={draft.collegeId}
                  onChange={(e) => setDraft((d) => ({ ...d, collegeId: e.target.value }))}
                  options={[
                    { value: "", label: "Choose…" },
                    ...lookups.colleges.map((c) => ({ value: c.id, label: c.shortName })),
                  ]}
                />
                <NeoSelect
                  label="Department"
                  value={draft.department}
                  onChange={(e) => setDraft((d) => ({ ...d, department: e.target.value }))}
                  options={[
                    { value: "", label: "Choose…" },
                    ...(courses.data ?? []).map((c) => ({ value: c.id, label: c.name })),
                  ]}
                />
                <NeoSelect
                  label="Gender"
                  value={draft.gender}
                  onChange={(e) => setDraft((d) => ({ ...d, gender: e.target.value }))}
                  options={[
                    { value: "male", label: "Male" },
                    { value: "female", label: "Female" },
                    { value: "other", label: "Other" },
                  ]}
                />
                <NeoSelect
                  label="Year"
                  value={draft.yearOfStudy}
                  onChange={(e) => setDraft((d) => ({ ...d, yearOfStudy: e.target.value }))}
                  options={[
                    { value: "", label: "Choose…" },
                    ...["1", "2", "3", "4"].map((y) => ({ value: y, label: `Year ${y}` })),
                  ]}
                />
                <NeoSelect
                  label="T-shirt"
                  value={draft.tshirtSize}
                  onChange={(e) => setDraft((d) => ({ ...d, tshirtSize: e.target.value }))}
                  options={["XS", "S", "M", "L", "XL", "XXL"].map((t) => ({ value: t, label: t }))}
                />
                <NeoSelect
                  label="Dietary"
                  value={draft.dietaryPref}
                  onChange={(e) => setDraft((d) => ({ ...d, dietaryPref: e.target.value }))}
                  options={[
                    { value: "veg", label: "Vegetarian" },
                    { value: "non_veg", label: "Non-vegetarian" },
                    { value: "vegan", label: "Vegan" },
                    { value: "jain", label: "Jain" },
                  ]}
                />
                <NeoInput
                  label="Emergency contact"
                  value={draft.emergencyName}
                  onChange={(e) => setDraft((d) => ({ ...d, emergencyName: e.target.value }))}
                  placeholder="Name and relation"
                />
                <NeoInput
                  label="Emergency phone"
                  mono
                  value={draft.emergencyPhone}
                  onChange={(e) => setDraft((d) => ({ ...d, emergencyPhone: e.target.value }))}
                />
              </div>
              <NeoButton
                icon={<UserPlus />}
                onClick={createPerson}
                disabled={busy || !draft.fullName.trim() || !draft.email.trim()}
              >
                Add participant
              </NeoButton>
            </>
          )}
        </NeoCard.Body>
      </NeoCard>

      {/* 2 and 3 — enrol, then take the money */}
      <div className="space-y-4">
        <NeoCard>
          <NeoCard.Header eyebrow="Step 2" title="Enrol in events" />
          <NeoCard.Body className="space-y-3">
            <NeoSelect
              label="Event"
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
              disabled={!person}
              options={[
                { value: "", label: "Select an event…" },
                ...(events.data ?? []).map((ev: FestEvent) => ({ value: ev.id, label: ev.title })),
              ]}
            />
            <NeoButton icon={<Ticket />} onClick={enrol} disabled={busy || !person || !eventId}>
              Add registration
            </NeoButton>
            {enrolled.length ? (
              <ul className="space-y-1">
                {enrolled.map((code) => (
                  <li key={code} className="flex items-center gap-2 text-[0.78rem] text-ink-muted">
                    <CheckCircle2 className="size-3.5 text-paid" />
                    <span className="font-mono">{code}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </NeoCard.Body>
        </NeoCard>

        <NeoCard>
          <NeoCard.Header eyebrow="Step 3" title="Take payment" />
          <NeoCard.Body className="space-y-3">
            <NeoSelect
              label="Method"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              disabled={!person || paid !== null}
              options={PAYMENT_METHODS.map((m) => ({ value: m.id, label: m.label }))}
            />
            <NeoInput
              label="Reference"
              hint="UPI or bank reference. Leave blank for cash."
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              disabled={!person || paid !== null}
            />
            {paid === null ? (
              <NeoButton icon={<IndianRupee />} onClick={takePayment} disabled={busy || !person}>
                Record payment
              </NeoButton>
            ) : (
              <div className="rounded-neo border border-engrave p-3">
                <p className="text-[0.85rem] font-semibold text-ink">{inr(paid)} recorded</p>
                {/* Says "pending", not "paid": an ADMIN still has to clear it. */}
                <p className="mt-1 text-[0.75rem] text-ink-muted">
                  Sitting in the verification queue. The participant is confirmed once an
                  admin verifies it.
                </p>
              </div>
            )}
          </NeoCard.Body>
        </NeoCard>
      </div>
    </div>
  );
}
