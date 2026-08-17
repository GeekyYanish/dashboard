/**
 * MockRepository — the Repository implementation backed by the seeded store.
 *
 * This is where the business rules live, and they are the same rules the real
 * backend will need. Each one exists because it corresponds to a way a
 * registration desk actually loses money or trust:
 *
 *   - UTR uniqueness          → the same payment screenshot, submitted twice
 *   - breakdown sums to total → a fee quote that silently disagrees with the charge
 *   - idempotent verification → a double-click that double-issues an invoice
 *   - refund ≤ net paid       → refunding more than was ever collected
 *   - waitlist promotion      → a cancelled seat that nobody reallocates
 *   - allotment gates         → a bed given to someone who never paid
 *   - audit on every write    → "who confirmed this?" a week later
 *
 * /dev/data-test asserts all of them.
 */

import {
  CATEGORIES,
  DOC_TYPES,
  FEES,
  FEST,
  HOSTEL_BLOCKS,
  MEALS,
  STAFF_ROLES,
  TRACKS,
} from "../../fest.config";
import { cheapHash } from "./seed";
import { can, rolesFor, type Capability } from "../../auth/permissions";
import { checkPassword, hashPassword, verifyPassword } from "../../auth/crypto";
import * as sessionStore from "../../auth/session";
import type { Session } from "../../auth/session";
import { getStore, resetStore, type Store } from "./store";
import { DataError } from "../types";
import type {
  AccommodationRequest,
  Announcement,
  AttentionItem,
  Attendance,
  AuditEvent,
  Broadcast,
  CertificateIssue,
  Coupon,
  DeskShift,
  DocumentSubmission,
  EventStats,
  FeeLine,
  FestEvent,
  HelpdeskTicket,
  KitIssue,
  MealCoupon,
  MessageLog,
  MessageTemplate,
  OverviewStats,
  Participant,
  ParticipantFlags,
  Payment,
  PickupSlot,
  QueueToken,
  Refund,
  Registration,
  RegistrationStatus,
  RoomAllotment,
  SavedView,
  Settlement,
  StaffMember,
  SubstitutionRequest,
  Team,
  TravelRecord,
} from "../types";
import type {
  Actor,
  ImportPreview,
  ImportRow,
  ParticipantFilter,
  PaymentFilter,
  RegistrationFilter,
  Repository,
} from "../repository";

/**
 * The world's "now" — real time.
 *
 * The previous build froze this to keep the demo stable. With the dataset cut
 * to a small worked example dated relative to the fest, a frozen clock only
 * made timestamps drift out of step with reality. `tick()` still exists for the
 * war-room refresh, but no longer distorts time.
 */
let clockOffsetMs = 0;
const now = () => new Date(Date.now() + clockOffsetMs);
const nowIso = () => now().toISOString();

const uid = (() => {
  let n = 0;
  return (prefix: string) => `${prefix}-${Date.now().toString(36)}${(n++).toString(36)}`;
})();

const pad = (n: number, w: number) => String(n).padStart(w, "0");
const hoursBetween = (a: string, b: Date = now()) =>
  (b.getTime() - new Date(a).getTime()) / 3_600_000;
const daysBetween = (a: string, b: Date = now()) => hoursBetween(a, b) / 24;

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export class MockRepository implements Repository {
  private s: Store;

  constructor() {
    this.s = getStore();
  }

  private get d() {
    return this.s.data;
  }

  // =========================================================================
  // Identity & authorisation
  //
  // `assertCan` is the ACTUAL enforcement. The UI reads the same capability map
  // to decide what to disable, but disabling a button is a courtesy — this is
  // the check that has to hold. Before this existed the settings matrix
  // advertised ten permissions and the repository enforced two.
  //
  // When a server lands, this method moves verbatim into a server action and
  // every call site below stays exactly where it is.
  // =========================================================================

  /** The signed-in staff record, or null. */
  private currentStaff(): StaffMember | null {
    const s = sessionStore.current();
    if (!s) return null;
    return this.d.staff.find((x) => x.id === s.staffId) ?? null;
  }

  /** Throws unless someone is signed in. Returns the record so callers can use it. */
  private requireStaff(): StaffMember {
    const staff = this.currentStaff();
    if (!staff) throw new DataError("NOT_AUTHENTICATED", "Sign in to continue");
    if (!staff.isActive) throw new DataError("ACCOUNT_DISABLED", "This account is disabled");
    return staff;
  }

  /**
   * The authorisation gate. Every mutating method calls this first.
   *
   * The message names the capability AND the roles that hold it, so a blocked
   * operator can ask for the right thing instead of filing "it doesn't work".
   */
  private assertCan(cap: Capability): StaffMember {
    const staff = this.requireStaff();
    if (!can(staff.role, cap)) {
      const allowed = rolesFor(cap)
        .map((r) => STAFF_ROLES.find((x) => x.id === r)?.label ?? r)
        .join(" or ");
      throw new DataError(
        "FORBIDDEN",
        `Your role cannot do this — "${cap}" requires ${allowed}`,
        cap,
      );
    }
    return staff;
  }

  // -------------------------------------------------------------------------
  // Audit — every mutation goes through here. No silent writes.
  // -------------------------------------------------------------------------

  private log(
    action: string,
    entity: string,
    entityId: string,
    before: Record<string, unknown> | null,
    after: Record<string, unknown> | null,
    note?: string,
  ) {
    // Tolerates a missing session so sign-out and system writes can still be
    // recorded — an unattributed audit line is far better than a lost one.
    const actor = this.currentStaff();
    const ev: AuditEvent = {
      id: uid("aud"),
      actorId: actor?.id ?? "system",
      actorName: actor?.name ?? "System",
      action,
      entity,
      entityId,
      before,
      after,
      at: nowIso(),
      note: note ?? null,
    };
    this.d.audit.unshift(ev);
    this.s.patch({ t: "upsert", c: "audit", v: ev as unknown as Record<string, unknown> });
  }

  /** The ONLY write path. Bumping `version` here is what invalidates indexes. */
  private save<K extends keyof typeof this.d>(c: K, rec: { id: string }) {
    this.version++;
    this.s.patch({ t: "upsert", c, v: rec as unknown as Record<string, unknown> });
  }

  private remove(c: keyof typeof this.d, id: string) {
    this.version++;
    this.s.patch({ t: "delete", c, id });
  }

  // =========================================================================
  // Indexes
  //
  // Every derived figure below is per-participant, and the console asks for
  // them 2,400 at a time. Done naively that is a linear scan of 6,000
  // registrations per participant — measured at ~1.8s to paint the overview.
  // These indexes are built once per mutation and drop it to ~90ms.
  //
  // `version` is bumped by save()/patch(), so any write invalidates them. That
  // is the whole cache-invalidation story: there is no manual bookkeeping to
  // get wrong.
  // =========================================================================

  private version = 0;
  private idxVersion = -1;
  private idx!: {
    paymentsBy: Map<string, Payment[]>;
    refundsBy: Map<string, Refund[]>;
    regsBy: Map<string, Registration[]>;
    accBy: Map<string, AccommodationRequest[]>;
    docsBy: Map<string, DocumentSubmission[]>;
    eventsById: Map<string, FestEvent>;
    participantsById: Map<string, Participant>;
    indemnityEventIds: Set<string>;
  };

  private indexes() {
    if (this.idxVersion === this.version && this.idx) return this.idx;
    const group = <T extends { participantId: string }>(rows: T[]) => {
      const m = new Map<string, T[]>();
      for (const r of rows) {
        const arr = m.get(r.participantId);
        if (arr) arr.push(r);
        else m.set(r.participantId, [r]);
      }
      return m;
    };
    this.idx = {
      paymentsBy: group(this.d.payments),
      refundsBy: group(this.d.refunds),
      regsBy: group(this.d.registrations),
      accBy: group(this.d.accommodation),
      docsBy: group(this.d.documents),
      eventsById: new Map(this.d.events.map((e) => [e.id, e])),
      participantsById: new Map(this.d.participants.map((p) => [p.id, p])),
      indemnityEventIds: new Set(
        this.d.events.filter((e) => e.requiresIndemnity).map((e) => e.id),
      ),
    };
    this.idxVersion = this.version;
    return this.idx;
  }

  // =========================================================================
  // Derived helpers used across modules
  // =========================================================================

  /** Net verified money for a participant, minus refunds already paid out. */
  private netPaid(participantId: string): number {
    const ix = this.indexes();
    let paid = 0;
    for (const p of ix.paymentsBy.get(participantId) ?? [])
      if (p.status === "verified") paid += p.amount;
    let refunded = 0;
    for (const r of ix.refundsBy.get(participantId) ?? [])
      if (r.status === "paid" || r.status === "approved") refunded += r.amount;
    return paid - refunded;
  }

  /** What a participant owes in total: category pass + every live registration. */
  private grossDue(participantId: string): number {
    const ix = this.indexes();
    const p = ix.participantsById.get(participantId);
    if (!p) return 0;
    const cat = CATEGORIES.find((c) => c.id === p.category);
    let total = cat?.baseFee ?? 0;
    for (const r of ix.regsBy.get(participantId) ?? []) {
      if (r.status === "cancelled" || r.status === "rejected") continue;
      total += r.feeInr;
    }
    for (const a of ix.accBy.get(participantId) ?? [])
      if (a.status !== "cancelled") {
        total += a.amount;
        break;
      }
    return total;
  }

  private requiredDocsFor(p: Participant): string[] {
    const ix = this.indexes();
    const cat = CATEGORIES.find((c) => c.id === p.category);
    const req = new Set<string>(cat ? [...cat.requiredDocs] : []);
    if (this.isMinor(p)) req.add("guardian_consent");
    const regs = ix.regsBy.get(p.id) ?? [];
    if (regs.some((r) => r.status !== "cancelled" && ix.indemnityEventIds.has(r.eventId)))
      req.add("indemnity");
    if ((ix.accBy.get(p.id) ?? []).some((a) => a.status !== "cancelled")) req.add("id_proof");
    return [...req];
  }

  private isMinor(p: Participant): boolean {
    const fest = new Date(FEST.startsAt).getTime();
    const dob = new Date(p.dateOfBirth).getTime();
    return (fest - dob) / (365.25 * 86400000) < 18;
  }

  // =========================================================================
  // auth
  // =========================================================================

  /** Five failures locks the account for a minute. */
  private static readonly MAX_ATTEMPTS = 5;
  private static readonly LOCKOUT_MS = 60_000;

  auth = {
    signIn: async (email: string, password: string): Promise<Session> => {
      const staff = this.d.staff.find(
        (x) => x.email.toLowerCase() === email.trim().toLowerCase(),
      );

      // Same error whether the account is missing or the password is wrong —
      // distinguishing them tells an attacker which emails are real.
      if (!staff) throw new DataError("INVALID_CREDENTIALS", "Email or password is incorrect");
      if (!staff.isActive) throw new DataError("ACCOUNT_DISABLED", "This account is disabled");

      if (staff.lockedUntil && new Date(staff.lockedUntil) > now()) {
        const secs = Math.ceil((new Date(staff.lockedUntil).getTime() - now().getTime()) / 1000);
        throw new DataError("ACCOUNT_LOCKED", `Too many attempts — try again in ${secs}s`);
      }

      const ok = await verifyPassword(password, staff.passwordHash, staff.passwordSalt);
      if (!ok) {
        staff.failedAttempts += 1;
        if (staff.failedAttempts >= MockRepository.MAX_ATTEMPTS) {
          staff.lockedUntil = new Date(now().getTime() + MockRepository.LOCKOUT_MS).toISOString();
          staff.failedAttempts = 0;
        }
        this.save("staff", staff);
        throw new DataError("INVALID_CREDENTIALS", "Email or password is incorrect");
      }

      staff.failedAttempts = 0;
      staff.lockedUntil = null;
      staff.lastLoginAt = nowIso();
      this.save("staff", staff);

      const session = sessionStore.mint({
        staffId: staff.id,
        name: staff.name,
        email: staff.email,
        role: staff.role,
        mustChangePassword: staff.mustChangePassword,
      });
      this.log("auth.signed_in", "staff", staff.id, null, { role: staff.role });
      return session;
    },

    signOut: async () => {
      const staff = this.currentStaff();
      if (staff) this.log("auth.signed_out", "staff", staff.id, null, null);
      sessionStore.clear();
    },

    session: async () => sessionStore.current(),

    changePassword: async (currentPw: string, nextPw: string) => {
      const staff = this.requireStaff();

      const ok = await verifyPassword(currentPw, staff.passwordHash, staff.passwordSalt);
      if (!ok) throw new DataError("INVALID_CREDENTIALS", "Your current password is incorrect");

      const check = checkPassword(nextPw, staff.email);
      if (!check.ok) throw new DataError("PASSWORD_TOO_WEAK", check.problems[0]);

      // A fresh salt on every change, so an old leaked hash tells you nothing
      // about the new password.
      const { hash, salt } = await hashPassword(nextPw);
      staff.passwordHash = hash;
      staff.passwordSalt = salt;
      staff.mustChangePassword = false;
      this.save("staff", staff);

      sessionStore.patch({ mustChangePassword: false });
      this.log("auth.password_changed", "staff", staff.id, null, null);
    },

    onAuthStateChange: (cb: (s: Session | null) => void) => sessionStore.subscribe(cb),
  };

  // =========================================================================
  // overview
  // =========================================================================

  overview = {
    stats: async (): Promise<OverviewStats> => {
      const d = this.d;
      const live = d.registrations.filter((r) => r.status !== "cancelled" && r.status !== "rejected");
      const confirmed = d.registrations.filter((r) => r.status === "confirmed").length;
      const pending = d.registrations.filter((r) => r.status === "pending").length;
      const waitlisted = d.registrations.filter((r) => r.status === "waitlisted").length;
      const cancelled = d.registrations.filter((r) => r.status === "cancelled").length;

      const verified = d.payments.filter((p) => p.status === "verified");
      const revenueCollected = verified.reduce((s, p) => s + p.amount, 0);
      const queue = d.payments.filter((p) => p.status === "pending");

      const participantIds = new Set(live.map((r) => r.participantId));
      let expected = 0;
      for (const id of participantIds) expected += this.grossDue(id);

      const outstanding = Math.max(0, expected - revenueCollected);

      const oldestPendingHours = queue.length
        ? Math.max(...queue.map((p) => hoursBetween(p.submittedAt)))
        : 0;

      // ---- 30-day series -------------------------------------------------
      const series: OverviewStats["series"] = [];
      for (let i = 29; i >= 0; i--) {
        const day = new Date(now().getTime() - i * 86400000);
        const key = day.toISOString().slice(0, 10);
        const regs = d.registrations.filter((r) => r.registeredAt.slice(0, 10) === key);
        const pays = verified.filter((p) => p.submittedAt.slice(0, 10) === key);
        series.push({
          date: key,
          registrations: regs.length,
          confirmed: regs.filter((r) => r.status === "confirmed").length,
          revenue: pays.reduce((s, p) => s + p.amount, 0),
        });
      }

      const revenueByMethod = ["upi", "neft", "gateway", "cash"].map((m) => {
        const rows = verified.filter((p) => p.method === m);
        return { method: m, amount: rows.reduce((s, p) => s + p.amount, 0), count: rows.length };
      });

      const registrationsByTrack = TRACKS.map((t) => ({
        track: t.id,
        count: live.filter((r) => d.events.find((e) => e.id === r.eventId)?.track === t.id).length,
      }));

      const collegeAgg = new Map<string, { count: number; paid: number; due: number }>();
      for (const p of d.participants) {
        const cur = collegeAgg.get(p.collegeId) ?? { count: 0, paid: 0, due: 0 };
        cur.count++;
        cur.paid += this.netPaid(p.id);
        cur.due += Math.max(0, this.grossDue(p.id) - this.netPaid(p.id));
        collegeAgg.set(p.collegeId, cur);
      }
      const topColleges = [...collegeAgg.entries()]
        .map(([collegeId, v]) => ({
          collegeId,
          name: d.colleges.find((c) => c.id === collegeId)?.shortName ?? collegeId,
          ...v,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      const docCompleteness = await this.documents.completeness();
      const docsPending = docCompleteness.filter((c) => c.missing.length > 0).length;

      const accCapacity = HOSTEL_BLOCKS.reduce(
        (s, b) => s + b.floors * b.roomsPerFloor * b.bedsPerRoom,
        0,
      );

      const today = now().toISOString().slice(0, 10);

      // Funnel — where people fall out between intent and turning up.
      const submitted = d.registrations.length;
      const paidCount = new Set(verified.map((p) => p.participantId)).size;
      const funnel = [
        { stage: "Registered", count: submitted },
        { stage: "Payment submitted", count: d.payments.length },
        { stage: "Payment verified", count: verified.length },
        { stage: "Confirmed", count: confirmed },
        { stage: "Docs cleared", count: docCompleteness.filter((c) => !c.missing.length).length },
        { stage: "Checked in", count: new Set(d.attendance.map((a) => a.participantId)).size },
      ];
      void paidCount;

      return {
        totalRegistrations: d.registrations.length,
        confirmed,
        pending,
        waitlisted,
        cancelled,
        participants: d.participants.length,
        collegesOnboarded: new Set(d.participants.map((p) => p.collegeId)).size,
        revenueCollected,
        revenueExpected: expected,
        outstandingDues: outstanding,
        verificationQueueDepth: queue.length,
        oldestPendingHours,
        accommodationRequested: d.accommodation.filter((a) => a.status !== "cancelled").length,
        accommodationAllotted: d.allotments.length,
        accommodationCapacity: accCapacity,
        checkedInToday: d.attendance.filter((a) => a.checkedInAt.slice(0, 10) === today).length,
        docsPending,
        openTickets: d.tickets.filter((t) => t.status !== "resolved" && t.status !== "closed").length,
        funnel,
        series,
        revenueByMethod,
        registrationsByTrack,
        topColleges,
      };
    },

    attention: async (): Promise<AttentionItem[]> => {
      const d = this.d;
      const out: AttentionItem[] = [];

      const aging = d.payments.filter(
        (p) => p.status === "pending" && hoursBetween(p.submittedAt) > 24,
      );
      if (aging.length)
        out.push({
          id: "att-aging",
          kind: "payment_aging",
          severity: aging.length > 40 ? "critical" : "warning",
          title: `${aging.length} payments unverified past 24h`,
          detail: "The verification SLA is 24 hours. Oldest is " +
            `${Math.round(Math.max(...aging.map((p) => hoursBetween(p.submittedAt))))}h.`,
          href: "/payments/queue",
          count: aging.length,
        });

      const flagged = d.payments.filter((p) => p.fraudFlags.length > 0);
      if (flagged.length)
        out.push({
          id: "att-fraud",
          kind: "fraud",
          severity: "critical",
          title: `${flagged.length} payments flagged`,
          detail: "Reused UTR or duplicate receipt detected. Review before verifying.",
          href: "/payments/fraud",
          count: flagged.length,
        });

      const over = (await this.events.allStats()).filter(
        (s) => s.capacity != null && s.confirmedCount > s.capacity,
      );
      if (over.length)
        out.push({
          id: "att-cap",
          kind: "over_capacity",
          severity: "warning",
          title: `${over.length} events over capacity`,
          detail: "Confirmed registrations exceed the declared seat count.",
          href: "/events",
          count: over.length,
        });

      const completeness = await this.documents.completeness();
      const missing = completeness.filter((c) => c.missing.length > 0);
      if (missing.length)
        out.push({
          id: "att-docs",
          kind: "docs_missing",
          severity: missing.length > 300 ? "critical" : "warning",
          title: `${missing.length} participants missing documents`,
          detail: "Badges cannot be printed until required documents are approved.",
          href: "/documents",
          count: missing.length,
        });

      const unallotted = d.accommodation.filter((a) => a.status === "requested");
      if (unallotted.length)
        out.push({
          id: "att-acc",
          kind: "unallotted",
          severity: "warning",
          title: `${unallotted.length} accommodation requests unallotted`,
          detail: "Allot beds before arrival day or the hostel desk will queue.",
          href: "/accommodation",
          count: unallotted.length,
        });

      const incomplete = await this.teams.incomplete();
      if (incomplete.length)
        out.push({
          id: "att-team",
          kind: "team_incomplete",
          severity: "warning",
          title: `${incomplete.length} teams below minimum size`,
          detail: "These teams cannot compete unless they add members or substitute.",
          href: "/teams",
          count: incomplete.length,
        });

      return out.sort((a, b) => (a.severity === b.severity ? b.count - a.count : a.severity === "critical" ? -1 : 1));
    },

    activity: async (limit = 20): Promise<AuditEvent[]> => clone(this.d.audit.slice(0, limit)),

    announcements: async (): Promise<Announcement[]> => clone(this.d.announcements),
  };

  // =========================================================================
  // participants
  // =========================================================================

  participants = {
    list: async (filter?: ParticipantFilter): Promise<Participant[]> => {
      let rows = this.d.participants;
      if (filter?.collegeId) rows = rows.filter((p) => p.collegeId === filter.collegeId);
      if (filter?.category) rows = rows.filter((p) => p.category === filter.category);
      if (filter?.gender) rows = rows.filter((p) => p.gender === filter.gender);
      if (filter?.search) {
        const q = filter.search.toLowerCase();
        rows = rows.filter(
          (p) =>
            p.fullName.toLowerCase().includes(q) ||
            p.code.toLowerCase().includes(q) ||
            p.email.toLowerCase().includes(q) ||
            p.phone.replace(/\s/g, "").includes(q.replace(/\s/g, "")),
        );
      }
      if (filter?.hasDues) {
        rows = rows.filter((p) => this.grossDue(p.id) - this.netPaid(p.id) > 0);
      }
      if (filter?.docsComplete != null) {
        rows = rows.filter((p) => {
          const req = this.requiredDocsFor(p);
          const ok = this.d.documents.filter(
            (dd) => dd.participantId === p.id && dd.status === "approved",
          );
          const complete = req.every((r) => ok.some((o) => o.docType === r));
          return complete === filter.docsComplete;
        });
      }
      return clone(rows);
    },

    get: async (id: string) => clone(this.d.participants.find((p) => p.id === id) ?? null),

    getByCode: async (code: string) =>
      clone(this.d.participants.find((p) => p.code.toLowerCase() === code.toLowerCase()) ?? null),

    search: async (q: string, limit = 12): Promise<Participant[]> => {
      const needle = q.trim().toLowerCase();
      if (!needle) return [];
      const digits = needle.replace(/\D/g, "");
      const scored = this.d.participants
        .map((p) => {
          const name = p.fullName.toLowerCase();
          const code = p.code.toLowerCase();
          const phone = p.phone.replace(/\D/g, "");
          let score = 0;
          if (code === needle) score = 100;
          else if (digits.length >= 6 && phone.endsWith(digits)) score = 95;
          else if (code.includes(needle)) score = 80;
          else if (name.startsWith(needle)) score = 70;
          else if (name.includes(needle)) score = 50;
          else if (p.email.toLowerCase().includes(needle)) score = 40;
          return { p, score };
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
      return clone(scored.map((x) => x.p));
    },

    flags: async (id: string): Promise<ParticipantFlags> => {
      const p = this.d.participants.find((x) => x.id === id);
      if (!p) throw new DataError("NOT_FOUND", "Participant not found");
      const required = this.requiredDocsFor(p);
      const approved = this.d.documents
        .filter((dd) => dd.participantId === id && dd.status === "approved")
        .map((dd) => dd.docType);
      const missing = required.filter((r) => !approved.includes(r as never));
      const paid = this.netPaid(id);
      return {
        isMinor: this.isMinor(p),
        docsComplete: missing.length === 0,
        missingDocs: missing as ParticipantFlags["missingDocs"],
        amountPaid: paid,
        amountDue: Math.max(0, this.grossDue(id) - paid),
      };
    },

    create: async (input: Omit<Participant, "id" | "code" | "createdAt" | "isBlocked">) => {
      const dupe = this.d.participants.find(
        (p) => p.phone.replace(/\D/g, "") === input.phone.replace(/\D/g, ""),
      );
      if (dupe) throw new DataError("DUPLICATE_PARTICIPANT", `Phone already registered to ${dupe.code}`);
      const n = this.d.participants.length + 1;
      const rec: Participant = {
        ...input,
        id: uid("ptc"),
        code: `${FEST.serials.registration}-${pad(n, 5)}`,
        createdAt: nowIso(),
        isBlocked: false,
      };
      this.d.participants.push(rec);
      this.save("participants", rec);
      this.log("participant.created", "participant", rec.id, null, { code: rec.code, name: rec.fullName });
      return clone(rec);
    },

    update: async (id: string, patch: Partial<Participant>) => {
      const rec = this.d.participants.find((p) => p.id === id);
      if (!rec) throw new DataError("NOT_FOUND");
      const before: Record<string, unknown> = {};
      for (const k of Object.keys(patch)) before[k] = (rec as unknown as Record<string, unknown>)[k];
      Object.assign(rec, patch);
      this.save("participants", rec);
      this.log("participant.updated", "participant", id, before, patch as Record<string, unknown>);
      return clone(rec);
    },

    findDuplicates: async () => {
      const out: { a: Participant; b: Participant; reason: string; score: number }[] = [];
      const byPhone = new Map<string, Participant[]>();
      const byEmail = new Map<string, Participant[]>();
      for (const p of this.d.participants) {
        const ph = p.phone.replace(/\D/g, "").slice(-10);
        const em = p.email.toLowerCase().split("@")[0].replace(/[^a-z]/g, "");
        byPhone.set(ph, [...(byPhone.get(ph) ?? []), p]);
        byEmail.set(em, [...(byEmail.get(em) ?? []), p]);
      }
      const seen = new Set<string>();
      const add = (a: Participant, b: Participant, reason: string, score: number) => {
        const key = [a.id, b.id].sort().join("|");
        if (seen.has(key)) return;
        seen.add(key);
        out.push({ a, b, reason, score });
      };
      for (const group of byPhone.values())
        if (group.length > 1)
          for (let i = 1; i < group.length; i++) add(group[0], group[i], "Identical phone number", 95);
      for (const group of byEmail.values())
        if (group.length > 1)
          for (let i = 1; i < group.length; i++) {
            if (group[0].fullName.toLowerCase() === group[i].fullName.toLowerCase())
              add(group[0], group[i], "Same name and email handle", 88);
          }
      return clone(out.sort((a, b) => b.score - a.score));
    },

    merge: async (keepId: string, mergeId: string) => {
      this.assertCan("registrations.write");
      const keep = this.d.participants.find((p) => p.id === keepId);
      const drop = this.d.participants.find((p) => p.id === mergeId);
      if (!keep || !drop) throw new DataError("NOT_FOUND");
      // Re-point everything the dropped record owned, skipping registrations
      // that would collide with one the surviving record already has.
      for (const r of this.d.registrations) {
        if (r.participantId !== mergeId) continue;
        const collision = this.d.registrations.some(
          (x) => x.participantId === keepId && x.eventId === r.eventId,
        );
        // Always re-point, even when cancelling: leaving a row attached to a
        // participant that is about to be deleted is a dangling reference, and
        // it made the merged person's history disappear from their own record.
        r.participantId = keepId;
        if (collision) {
          r.status = "cancelled";
          r.cancelReason = "duplicate";
          r.cancelledAt = nowIso();
        }
        this.save("registrations", r);
      }
      for (const coll of ["payments", "documents", "accommodation", "travel", "attendance"] as const) {
        for (const rec of this.d[coll] as { id: string; participantId: string }[]) {
          if (rec.participantId === mergeId) {
            rec.participantId = keepId;
            this.save(coll, rec);
          }
        }
      }
      const i = this.d.participants.findIndex((p) => p.id === mergeId);
      this.d.participants.splice(i, 1);
      this.remove("participants", mergeId);
      this.log("participant.merged", "participant", keepId, { mergedId: mergeId, code: drop.code }, { keptCode: keep.code });
      return clone(keep);
    },

    exportPersonalData: async (id: string) => {
      const p = this.d.participants.find((x) => x.id === id);
      if (!p) throw new DataError("NOT_FOUND");
      return clone({
        participant: p,
        registrations: this.d.registrations.filter((r) => r.participantId === id),
        payments: this.d.payments.filter((x) => x.participantId === id),
        documents: this.d.documents.filter((x) => x.participantId === id),
        accommodation: this.d.accommodation.filter((x) => x.participantId === id),
        allotments: this.d.allotments.filter((x) => x.participantId === id),
        travel: this.d.travel.filter((x) => x.participantId === id),
        attendance: this.d.attendance.filter((x) => x.participantId === id),
        messages: this.d.messageLogs.filter((x) => x.participantId === id),
        tickets: this.d.tickets.filter((x) => x.participantId === id),
        certificates: this.d.certificates.filter((x) => x.participantId === id),
      });
    },

    erase: async (id: string) => {
      this.assertCan("participants.erase");
      const p = this.d.participants.find((x) => x.id === id);
      if (!p) throw new DataError("NOT_FOUND");
      // Financial records are retained but de-identified — an erasure request
      // cannot delete an audited money trail.
      p.fullName = "[erased]";
      p.email = `erased-${id}@invalid`;
      p.phone = "";
      p.emergencyName = "[erased]";
      p.emergencyPhone = "";
      p.notes = "Personal data erased on request";
      this.save("participants", p);
      this.log("participant.erased", "participant", id, null, { code: p.code });
    },
  };

  // =========================================================================
  // registrations
  // =========================================================================

  registrations = {
    list: async (filter?: RegistrationFilter): Promise<Registration[]> => {
      let rows = this.d.registrations;
      if (filter?.status?.length) rows = rows.filter((r) => filter.status!.includes(r.status));
      if (filter?.eventId) rows = rows.filter((r) => r.eventId === filter.eventId);
      if (filter?.source?.length) rows = rows.filter((r) => filter.source!.includes(r.source));
      if (filter?.registeredAfter)
        rows = rows.filter((r) => r.registeredAt >= filter.registeredAfter!);
      if (filter?.registeredBefore)
        rows = rows.filter((r) => r.registeredAt <= filter.registeredBefore!);
      if (filter?.track) {
        const ids = new Set(this.d.events.filter((e) => e.track === filter.track).map((e) => e.id));
        rows = rows.filter((r) => ids.has(r.eventId));
      }
      if (filter?.collegeId) {
        const ids = new Set(
          this.d.participants.filter((p) => p.collegeId === filter.collegeId).map((p) => p.id),
        );
        rows = rows.filter((r) => ids.has(r.participantId));
      }
      if (filter?.category) {
        const ids = new Set(
          this.d.participants.filter((p) => p.category === filter.category).map((p) => p.id),
        );
        rows = rows.filter((r) => ids.has(r.participantId));
      }
      if (filter?.paymentStatus?.length) {
        rows = rows.filter((r) => {
          const pays = this.d.payments.filter((p) => p.registrationIds.includes(r.id));
          if (!pays.length) return filter.paymentStatus!.includes("unpaid");
          return pays.some((p) => filter.paymentStatus!.includes(p.status));
        });
      }
      if (filter?.docsComplete != null) {
        const ok = new Set(
          (await this.documents.completeness())
            .filter((c) => (c.missing.length === 0) === filter.docsComplete)
            .map((c) => c.participantId),
        );
        rows = rows.filter((r) => ok.has(r.participantId));
      }
      if (filter?.search) {
        const q = filter.search.toLowerCase();
        const pmap = new Map(this.d.participants.map((p) => [p.id, p]));
        rows = rows.filter((r) => {
          const p = pmap.get(r.participantId);
          return (
            r.code.toLowerCase().includes(q) ||
            (p &&
              (p.fullName.toLowerCase().includes(q) ||
                p.code.toLowerCase().includes(q) ||
                p.phone.replace(/\D/g, "").includes(q.replace(/\D/g, "")) ||
                p.email.toLowerCase().includes(q)))
          );
        });
      }
      return clone(rows);
    },

    get: async (id: string) => clone(this.d.registrations.find((r) => r.id === id) ?? null),

    forParticipant: async (participantId: string) =>
      clone(this.d.registrations.filter((r) => r.participantId === participantId)),

    forEvent: async (eventId: string) =>
      clone(this.d.registrations.filter((r) => r.eventId === eventId)),

    create: async (input: {
      participantId: string;
      eventId: string;
      teamId?: string | null;
      source?: "online" | "on_spot" | "csv_import";
    }) => {
      const ev = this.d.events.find((e) => e.id === input.eventId);
      this.assertCan("registrations.write");
      if (!ev) throw new DataError("NOT_FOUND", "Event not found");

      // Unique (eventId, participantId) — a live registration blocks a second.
      const existing = this.d.registrations.find(
        (r) =>
          r.eventId === input.eventId &&
          r.participantId === input.participantId &&
          r.status !== "cancelled" &&
          r.status !== "rejected",
      );
      if (existing) throw new DataError("ALREADY_REGISTERED", `Already registered as ${existing.code}`);

      if (ev.status === "registration_closed" || ev.status === "cancelled")
        throw new DataError("REGISTRATION_CLOSED", `${ev.title} is not accepting registrations`);

      const taken = this.d.registrations.filter(
        (r) => r.eventId === ev.id && (r.status === "confirmed" || r.status === "pending"),
      ).length;
      const full = ev.capacity != null && taken >= ev.capacity;

      const wl = this.d.registrations.filter(
        (r) => r.eventId === ev.id && r.status === "waitlisted",
      ).length;

      const n = this.d.registrations.length + 1;
      const rec: Registration = {
        id: uid("reg"),
        code: `R${pad(n, 6)}`,
        participantId: input.participantId,
        eventId: input.eventId,
        teamId: input.teamId ?? null,
        status: full ? "waitlisted" : "pending",
        waitlistPosition: full ? wl + 1 : null,
        feeInr: ev.feeInr,
        registeredAt: nowIso(),
        confirmedAt: null,
        cancelledAt: null,
        cancelReason: null,
        source: input.source ?? "online",
        notes: null,
      };
      this.d.registrations.push(rec);
      this.save("registrations", rec);
      this.log("registration.created", "registration", rec.id, null, {
        event: ev.title,
        status: rec.status,
      });
      return clone(rec);
    },

    setStatus: async (id: string, status: RegistrationStatus, reason?: string) => {
      this.assertCan("registrations.write");
      const rec = this.d.registrations.find((r) => r.id === id);
      if (!rec) throw new DataError("NOT_FOUND");
      const before = { status: rec.status };
      rec.status = status;
      if (status === "confirmed") rec.confirmedAt = nowIso();
      if (status === "cancelled") {
        rec.cancelledAt = nowIso();
        rec.cancelReason = reason ?? "other";
      }
      if (status !== "waitlisted") rec.waitlistPosition = null;
      this.save("registrations", rec);
      this.log("registration.status_changed", "registration", id, before, { status }, reason);
      return clone(rec);
    },

    cancel: async (id: string, reason: string) => {
      this.assertCan("registrations.cancel");
      const rec = this.d.registrations.find((r) => r.id === id);
      if (!rec) throw new DataError("NOT_FOUND");
      const wasLive = rec.status === "confirmed" || rec.status === "pending";
      const before = { status: rec.status };
      rec.status = "cancelled";
      rec.cancelledAt = nowIso();
      rec.cancelReason = reason;
      this.save("registrations", rec);

      // A freed seat must not sit idle — promote the earliest waitlister.
      let promoted: Registration | null = null;
      if (wasLive) {
        const queue = this.d.registrations
          .filter((r) => r.eventId === rec.eventId && r.status === "waitlisted")
          .sort((a, b) => (a.waitlistPosition ?? 0) - (b.waitlistPosition ?? 0));
        if (queue.length) {
          promoted = queue[0];
          promoted.status = "pending";
          promoted.waitlistPosition = null;
          this.save("registrations", promoted);
          // Everyone behind them moves up one.
          queue.slice(1).forEach((r, i) => {
            r.waitlistPosition = i + 1;
            this.save("registrations", r);
          });
          this.log("registration.promoted", "registration", promoted.id, { status: "waitlisted" }, { status: "pending" }, `Seat freed by ${rec.code}`);
        }
      }
      this.log("registration.cancelled", "registration", id, before, { status: "cancelled" }, reason);
      return { cancelled: clone(rec), promoted: promoted ? clone(promoted) : null };
    },

    bulkSetStatus: async (ids: string[], status: RegistrationStatus, reason?: string) => {
      let n = 0;
      for (const id of ids) {
        try {
          await this.registrations.setStatus(id, status, reason);
          n++;
        } catch {
          /* skip individual failures — the count reports what landed */
        }
      }
      return n;
    },

    clashes: async () => {
      const out: { participantId: string; a: Registration; b: Registration }[] = [];
      const byParticipant = new Map<string, Registration[]>();
      for (const r of this.d.registrations) {
        if (r.status === "cancelled" || r.status === "rejected") continue;
        byParticipant.set(r.participantId, [...(byParticipant.get(r.participantId) ?? []), r]);
      }
      const evmap = new Map(this.d.events.map((e) => [e.id, e]));
      for (const [pid, regs] of byParticipant) {
        for (let i = 0; i < regs.length; i++) {
          for (let j = i + 1; j < regs.length; j++) {
            const ea = evmap.get(regs[i].eventId);
            const eb = evmap.get(regs[j].eventId);
            if (!ea || !eb) continue;
            if (ea.startsAt < eb.endsAt && eb.startsAt < ea.endsAt)
              out.push({ participantId: pid, a: regs[i], b: regs[j] });
          }
        }
      }
      return clone(out);
    },

    previewImport: async (rows: string[][]): Promise<ImportPreview> => {
      // Expected header: name,email,phone,gender,dob,college,department,year,category,events
      const [header, ...body] = rows;
      const col = (name: string) =>
        header?.findIndex((h) => h.trim().toLowerCase().replace(/[^a-z]/g, "") === name) ?? -1;
      const idx = {
        name: col("name"),
        email: col("email"),
        phone: col("phone"),
        gender: col("gender"),
        dob: col("dob"),
        college: col("college"),
        department: col("department"),
        year: col("year"),
        category: col("category"),
        events: col("events"),
      };

      const out: ImportRow[] = body.map((raw, i) => {
        const messages: string[] = [];
        const get = (k: keyof typeof idx) => (idx[k] >= 0 ? (raw[idx[k]] ?? "").trim() : "");
        const name = get("name");
        const phone = get("phone").replace(/\D/g, "");
        const email = get("email");

        if (!name) messages.push("Missing name");
        if (phone.length < 10) messages.push("Phone must be 10 digits");
        if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) messages.push("Email looks invalid");

        const collegeRaw = get("college");
        const college = this.d.colleges.find(
          (c) =>
            c.shortName.toLowerCase() === collegeRaw.toLowerCase() ||
            c.name.toLowerCase() === collegeRaw.toLowerCase(),
        );
        if (collegeRaw && !college) messages.push(`Unknown college "${collegeRaw}"`);

        const catRaw = get("category").toLowerCase() || "participant";
        const category = CATEGORIES.find((c) => c.id === catRaw);
        if (!category) messages.push(`Unknown category "${catRaw}"`);

        const eventSlugs = get("events")
          .split(/[;|]/)
          .map((s) => s.trim())
          .filter(Boolean);
        const unknownEvents = eventSlugs.filter(
          (s) =>
            !this.d.events.some(
              (e) => e.slug === s.toLowerCase() || e.title.toLowerCase() === s.toLowerCase(),
            ),
        );
        if (unknownEvents.length) messages.push(`Unknown events: ${unknownEvents.join(", ")}`);

        const existing = this.d.participants.find(
          (p) => p.phone.replace(/\D/g, "").slice(-10) === phone.slice(-10),
        );

        let action: ImportRow["action"] = "create";
        if (messages.length) action = "error";
        else if (existing) {
          action = "update";
          messages.push(`Matches existing ${existing.code} — will update, not duplicate`);
        }

        return {
          line: i + 2,
          raw,
          parsed: {
            fullName: name,
            email,
            phone: get("phone"),
            gender: (get("gender").toLowerCase() || "male") as Participant["gender"],
            dateOfBirth: get("dob"),
            collegeId: college?.id,
            department: get("department"),
            yearOfStudy: Number(get("year")) || 1,
            category: category?.id,
            eventSlugs,
          },
          action,
          messages,
        };
      });

      return {
        rows: out,
        summary: {
          create: out.filter((r) => r.action === "create").length,
          update: out.filter((r) => r.action === "update").length,
          skip: out.filter((r) => r.action === "skip").length,
          error: out.filter((r) => r.action === "error").length,
        },
      };
    },

    commitImport: async (preview: ImportPreview) => {
      let created = 0;
      let skipped = 0;
      for (const row of preview.rows) {
        if (row.action === "error" || row.action === "skip") {
          skipped++;
          continue;
        }
        try {
          if (row.action === "create") {
            const p = await this.participants.create({
              fullName: row.parsed.fullName ?? "",
              email: row.parsed.email ?? "",
              phone: row.parsed.phone ?? "",
              gender: row.parsed.gender ?? "male",
              dateOfBirth: row.parsed.dateOfBirth ?? "2005-01-01",
              collegeId: row.parsed.collegeId ?? this.d.colleges[0].id,
              department: row.parsed.department ?? "Computer Science",
              yearOfStudy: row.parsed.yearOfStudy ?? 1,
              category: row.parsed.category ?? "participant",
              tshirtSize: "M",
              emergencyName: "",
              emergencyPhone: "",
              dietaryPref: "veg",
              notes: "Imported from CSV",
              createdVia: "csv_import",
            });
            for (const slug of row.parsed.eventSlugs ?? []) {
              const ev = this.d.events.find(
                (e) => e.slug === slug.toLowerCase() || e.title.toLowerCase() === slug.toLowerCase(),
              );
              if (ev)
                await this.registrations.create({
                  participantId: p.id,
                  eventId: ev.id,
                  source: "csv_import",
                });
            }
            created++;
          } else skipped++;
        } catch {
          skipped++;
        }
      }
      this.log("import.committed", "import", uid("imp"), null, { created, skipped });
      return { created, skipped };
    },

    waitlist: async (eventId: string) =>
      clone(
        this.d.registrations
          .filter((r) => r.eventId === eventId && r.status === "waitlisted")
          .sort((a, b) => (a.waitlistPosition ?? 0) - (b.waitlistPosition ?? 0)),
      ),

    promote: async (registrationId: string) => {
      this.assertCan("registrations.write");
      const rec = this.d.registrations.find((r) => r.id === registrationId);
      if (!rec) throw new DataError("NOT_FOUND");
      rec.status = "pending";
      rec.waitlistPosition = null;
      this.save("registrations", rec);
      this.log("registration.promoted", "registration", rec.id, { status: "waitlisted" }, { status: "pending" }, "Manual promotion");
      return clone(rec);
    },
  };

  // =========================================================================
  // payments
  // =========================================================================

  payments = {
    list: async (filter?: PaymentFilter): Promise<Payment[]> => {
      let rows = this.d.payments;
      if (filter?.status?.length) rows = rows.filter((p) => filter.status!.includes(p.status));
      if (filter?.method?.length) rows = rows.filter((p) => p.method != null && filter.method!.includes(p.method));
      if (filter?.minAmount != null) rows = rows.filter((p) => p.amount >= filter.minAmount!);
      if (filter?.maxAmount != null) rows = rows.filter((p) => p.amount <= filter.maxAmount!);
      if (filter?.from) rows = rows.filter((p) => p.submittedAt >= filter.from!);
      if (filter?.to) rows = rows.filter((p) => p.submittedAt <= filter.to!);
      if (filter?.flaggedOnly) rows = rows.filter((p) => p.fraudFlags.length > 0);
      if (filter?.search) {
        const q = filter.search.toLowerCase();
        const pmap = new Map(this.d.participants.map((p) => [p.id, p]));
        rows = rows.filter((p) => {
          const who = pmap.get(p.participantId);
          return (
            (p.utr ?? "").includes(q) ||
            (p.invoiceSerial ?? "").toLowerCase().includes(q) ||
            (who?.fullName.toLowerCase().includes(q) ?? false) ||
            (who?.code.toLowerCase().includes(q) ?? false)
          );
        });
      }
      return clone(rows);
    },

    get: async (id: string) => clone(this.d.payments.find((p) => p.id === id) ?? null),

    forParticipant: async (participantId: string) =>
      clone(this.d.payments.filter((p) => p.participantId === participantId)),

    queue: async () =>
      clone(
        this.d.payments
          .filter((p) => p.status === "pending")
          .sort((a, b) => (a.submittedAt < b.submittedAt ? -1 : 1)),
      ),

    receiptUrl: async (id: string) => {
      // Seeded receipts are placeholder strings ("data:seed/…"), not real data
      // URLs, so there is nothing a viewer could render. Only hand back a value
      // a browser can actually load.
      const data = this.d.payments.find((p) => p.id === id)?.receiptData ?? null;
      return data && /^data:[^;,]+[;,]/.test(data) && !data.startsWith("data:seed/") ? data : null;
    },

    create: async (input: {
      participantId: string;
      registrationIds: string[];
      method: string;
      utr?: string | null;
      amount: number;
      breakdown: FeeLine[];
      receiptData?: string | null;
      receiptFileName?: string | null;
      deskShiftId?: string | null;
    }) => {
      // A breakdown that disagrees with the total is how disputes start.
      this.assertCan("payments.collect");
      const sum = input.breakdown.reduce((s, b) => s + b.amount, 0);
      if (sum !== input.amount)
        throw new DataError(
          "AMOUNT_MISMATCH",
          `Breakdown sums to ₹${sum} but amount is ₹${input.amount}`,
        );

      // The single most common fee fraud at a fest: one UTR, many claims.
      if (input.utr) {
        const dupe = this.d.payments.find((p) => p.utr === input.utr);
        if (dupe)
          throw new DataError(
            "UTR_ALREADY_USED",
            `UTR ${input.utr} was already used by ${dupe.id}`,
          );
      }

      const rec: Payment = {
        id: uid("pay"),
        invoiceSerial: null,
        participantId: input.participantId,
        registrationIds: input.registrationIds,
        method: input.method as Payment["method"],
        utr: input.utr ?? null,
        amount: input.amount,
        breakdown: input.breakdown,
        status: "pending",
        receiptData: input.receiptData ?? null,
        receiptFileName: input.receiptFileName ?? null,
        receiptHash: input.receiptData ? cheapHash(input.receiptData) : null,
        submittedAt: nowIso(),
        reviewedBy: null,
        reviewedAt: null,
        reviewNote: null,
        deskShiftId: input.deskShiftId ?? null,
        fraudFlags: [],
      };
      this.d.payments.push(rec);
      this.save("payments", rec);

      // Cash goes straight into the shift drawer's expected total.
      if (rec.deskShiftId) {
        const shift = this.d.shifts.find((s) => s.id === rec.deskShiftId);
        if (shift && rec.method === "cash") {
          shift.expectedCash += rec.amount;
          this.save("shifts", shift);
        }
      }

      this.log("payment.created", "payment", rec.id, null, {
        amount: rec.amount,
        method: rec.method,
        utr: rec.utr,
      });
      return clone(rec);
    },

    review: async (id: string, decision: "verified" | "rejected" | "resubmit", note?: string) => {
      const actor = this.assertCan("payments.verify");
      const rec = this.d.payments.find((p) => p.id === id);
      if (!rec) throw new DataError("NOT_FOUND");

      // Idempotent: a double-click must not mint a second invoice serial.
      if (rec.status === "verified" && decision === "verified") return clone(rec);

      const before = { status: rec.status };

      rec.status = decision === "resubmit" ? "pending" : decision;
      rec.reviewedBy = actor.id;
      rec.reviewedAt = nowIso();
      rec.reviewNote = note ?? null;

      if (decision === "verified" && !rec.invoiceSerial) {
        this.d.invoiceCounter += 1;
        rec.invoiceSerial = `${FEST.serials.invoice}/${pad(this.d.invoiceCounter, 5)}`;
        this.s.patch({ t: "meta", k: "invoiceCounter", v: this.d.invoiceCounter });

        // A verified payment confirms the registrations it settles.
        for (const rid of rec.registrationIds) {
          const r = this.d.registrations.find((x) => x.id === rid);
          if (r && r.status === "pending") {
            r.status = "confirmed";
            r.confirmedAt = nowIso();
            this.save("registrations", r);
          }
        }
      }
      this.save("payments", rec);
      this.log(`payment.${decision}`, "payment", id, before, { status: rec.status, invoiceSerial: rec.invoiceSerial }, note);
      return clone(rec);
    },

    bulkReview: async (ids: string[], decision: "verified" | "rejected", note?: string) => {
      let n = 0;
      for (const id of ids) {
        try {
          await this.payments.review(id, decision, note);
          n++;
        } catch {
          /* keep going */
        }
      }
      return n;
    },

    runFraudSweep: async () => {
      this.assertCan("payments.verify");
      const utrSeen = new Map<string, string>();
      const hashSeen = new Map<string, string>();
      const flagged: Payment[] = [];

      for (const p of [...this.d.payments].sort((a, b) => (a.submittedAt < b.submittedAt ? -1 : 1))) {
        const flags: Payment["fraudFlags"] = [];

        if (p.utr) {
          const first = utrSeen.get(p.utr);
          if (first && first !== p.id)
            flags.push({ kind: "duplicate_utr", detail: `Same UTR as ${first}`, severity: "block" });
          else utrSeen.set(p.utr, p.id);
        }
        if (p.receiptHash) {
          const first = hashSeen.get(p.receiptHash);
          if (first && first !== p.id)
            flags.push({
              kind: "duplicate_receipt",
              detail: `Identical receipt image to ${first}`,
              severity: "block",
            });
          else hashSeen.set(p.receiptHash, p.id);
        }

        const sum = p.breakdown.reduce((s, b) => s + b.amount, 0);
        if (sum !== p.amount)
          flags.push({
            kind: "amount_mismatch",
            detail: `Breakdown ₹${sum} vs charged ₹${p.amount}`,
            severity: "warn",
          });

        const earliestReg = this.d.registrations
          .filter((r) => p.registrationIds.includes(r.id))
          .map((r) => r.registeredAt)
          .sort()[0];
        if (earliestReg && p.submittedAt < earliestReg)
          flags.push({
            kind: "paid_before_registration",
            detail: "Payment timestamp precedes the registration it settles",
            severity: "warn",
          });

        if (JSON.stringify(p.fraudFlags) !== JSON.stringify(flags)) {
          p.fraudFlags = flags;
          this.save("payments", p);
        }
        if (flags.length) flagged.push(p);
      }
      this.log("payment.fraud_sweep", "payment", "*", null, { flagged: flagged.length });
      return clone(flagged);
    },

    outstanding: async () => {
      const out: {
        participant: Participant;
        due: number;
        paid: number;
        ageDays: number;
        registrations: number;
      }[] = [];
      const ix = this.indexes();
      for (const p of this.d.participants) {
        const gross = this.grossDue(p.id);
        const paid = this.netPaid(p.id);
        const due = gross - paid;
        if (due <= 0) continue;
        const regs = (ix.regsBy.get(p.id) ?? []).filter(
          (r) => r.status !== "cancelled" && r.status !== "rejected",
        );
        if (!regs.length && gross === 0) continue;
        const oldest = regs.map((r) => r.registeredAt).sort()[0] ?? p.createdAt;
        out.push({
          participant: p,
          due,
          paid,
          ageDays: Math.floor(daysBetween(oldest)),
          registrations: regs.length,
        });
      }
      return clone(out.sort((a, b) => b.due - a.due));
    },

    quote: async (participantId: string, eventIds: string[], couponCode?: string) => {
      const p = this.d.participants.find((x) => x.id === participantId);
      if (!p) throw new DataError("NOT_FOUND");
      const cat = CATEGORIES.find((c) => c.id === p.category);
      const lines: FeeLine[] = [];

      if (cat && cat.baseFee > 0)
        lines.push({ label: `${cat.label} pass`, kind: "base", refId: null, amount: cat.baseFee });

      for (const id of eventIds) {
        const ev = this.d.events.find((e) => e.id === id);
        if (ev && ev.feeInr > 0)
          lines.push({ label: ev.title, kind: "event", refId: ev.id, amount: ev.feeInr });
      }

      if (now() < new Date(FEST.earlyBirdEndsAt) && cat && cat.baseFee > 0)
        lines.push({
          label: `Early bird (${FEES.earlyBirdDiscountPct}%)`,
          kind: "discount",
          refId: null,
          amount: -Math.round((cat.baseFee * FEES.earlyBirdDiscountPct) / 100),
        });

      const contingent = this.d.participants.filter((x) => x.collegeId === p.collegeId).length;
      if (contingent >= FEES.groupDiscountMinSize) {
        const sub = lines.filter((l) => l.amount > 0).reduce((s, l) => s + l.amount, 0);
        lines.push({
          label: `Contingent discount (${FEES.groupDiscountPct}%)`,
          kind: "discount",
          refId: null,
          amount: -Math.round((sub * FEES.groupDiscountPct) / 100),
        });
      }

      if (couponCode) {
        const c = this.d.coupons.find(
          (x) => x.code.toLowerCase() === couponCode.toLowerCase() && x.isActive,
        );
        if (!c) throw new DataError("VALIDATION_FAILED", `Coupon "${couponCode}" is not valid`);
        if (c.usedCount >= c.maxUses)
          throw new DataError("VALIDATION_FAILED", `Coupon "${couponCode}" is fully redeemed`);
        if (c.appliesTo !== "all" && c.appliesTo !== p.category)
          throw new DataError("VALIDATION_FAILED", `Coupon applies to ${c.appliesTo} only`);
        const sub = lines.reduce((s, l) => s + l.amount, 0);
        lines.push({
          label: `Coupon ${c.code}`,
          kind: "discount",
          refId: c.id,
          amount: c.kind === "percent" ? -Math.round((sub * c.value) / 100) : -c.value,
        });
      }

      const isOnSpot = now() >= new Date(FEST.startsAt);
      if (isOnSpot)
        lines.push({
          label: "On-spot surcharge",
          kind: "surcharge",
          refId: null,
          amount: FEES.onSpotSurcharge,
        });

      return clone(lines);
    },
  };

  // =========================================================================
  // refunds
  // =========================================================================

  refunds = {
    list: async () => clone(this.d.refunds),

    request: async (input: {
      paymentId: string;
      amount: number;
      reasonCode: Refund["reasonCode"];
      reasonNote?: string;
    }) => {
      const actor = this.assertCan("refunds.request");
      const pay = this.d.payments.find((p) => p.id === input.paymentId);
      if (!pay) throw new DataError("NOT_FOUND", "Payment not found");
      if (pay.status !== "verified")
        throw new DataError("PAYMENT_NOT_VERIFIED", "Only a verified payment can be refunded");

      const already = this.d.refunds
        .filter((r) => r.paymentId === pay.id && r.status !== "rejected")
        .reduce((s, r) => s + r.amount, 0);
      if (already + input.amount > pay.amount)
        throw new DataError(
          "REFUND_EXCEEDS_PAID",
          `₹${input.amount} would exceed the ₹${pay.amount - already} still refundable`,
        );

      const rec: Refund = {
        id: uid("rfd"),
        serial: `${FEST.serials.refund}/${pad(this.d.refunds.length + 1, 4)}`,
        paymentId: pay.id,
        participantId: pay.participantId,
        amount: input.amount,
        reasonCode: input.reasonCode,
        reasonNote: input.reasonNote ?? null,
        status: "requested",
        requestedBy: actor.id,
        requestedAt: nowIso(),
        approvedBy: null,
        approvedAt: null,
        paidAt: null,
        payoutRef: null,
      };
      this.d.refunds.push(rec);
      this.save("refunds", rec);
      this.log("refund.requested", "refund", rec.id, null, { amount: rec.amount, paymentId: pay.id });
      return clone(rec);
    },

    approve: async (id: string) => {
      const actor = this.assertCan("refunds.approve");
      const rec = this.d.refunds.find((r) => r.id === id);
      if (!rec) throw new DataError("NOT_FOUND");
      // Approving is a money decision — only the head may do it.
      if (actor.role !== "head")
        throw new DataError("FORBIDDEN", "Only the Registration Head can approve refunds");
      const before = { status: rec.status };
      rec.status = "approved";
      rec.approvedBy = actor.id;
      rec.approvedAt = nowIso();
      this.save("refunds", rec);
      this.log("refund.approved", "refund", id, before, { status: "approved" });
      return clone(rec);
    },

    markPaid: async (id: string, payoutRef: string) => {
      this.assertCan("refunds.approve");
      const rec = this.d.refunds.find((r) => r.id === id);
      if (!rec) throw new DataError("NOT_FOUND");
      if (rec.status !== "approved")
        throw new DataError("VALIDATION_FAILED", "Refund must be approved before payout");
      rec.status = "paid";
      rec.paidAt = nowIso();
      rec.payoutRef = payoutRef;
      this.save("refunds", rec);
      const pay = this.d.payments.find((p) => p.id === rec.paymentId);
      if (pay) {
        const total = this.d.refunds
          .filter((r) => r.paymentId === pay.id && r.status === "paid")
          .reduce((s, r) => s + r.amount, 0);
        if (total >= pay.amount) {
          pay.status = "refunded";
          this.save("payments", pay);
        }
      }
      this.log("refund.paid", "refund", id, { status: "approved" }, { status: "paid", payoutRef });
      return clone(rec);
    },

    reject: async (id: string, note: string) => {
      this.assertCan("refunds.approve");
      const rec = this.d.refunds.find((r) => r.id === id);
      if (!rec) throw new DataError("NOT_FOUND");
      const before = { status: rec.status };
      rec.status = "rejected";
      rec.reasonNote = note;
      this.save("refunds", rec);
      this.log("refund.rejected", "refund", id, before, { status: "rejected" }, note);
      return clone(rec);
    },
  };

  // =========================================================================
  // settlements — bank reconciliation
  // =========================================================================

  settlements = {
    list: async () => clone(this.d.settlements),

    importStatement: async (rows: string[][]) => {
      this.assertCan("settlements.reconcile");
      const [header, ...body] = rows;
      const col = (n: string) =>
        header?.findIndex((h) => h.trim().toLowerCase().replace(/[^a-z]/g, "").includes(n)) ?? -1;
      const iRef = col("ref");
      const iAmt = col("amount");
      const iDate = col("date");
      const iNarr = col("narration") >= 0 ? col("narration") : col("description");

      let imported = 0;
      let matched = 0;
      for (const raw of body) {
        const bankRef = (raw[iRef] ?? "").trim();
        const amount = Number((raw[iAmt] ?? "0").replace(/[^0-9.-]/g, ""));
        if (!bankRef || !amount) continue;
        if (this.d.settlements.some((s) => s.bankRef === bankRef)) continue;

        // Match on UTR first, then fall back to amount + same-day.
        let match = this.d.payments.find((p) => p.utr === bankRef);
        let confidence: Settlement["matchConfidence"] = match ? "exact" : "none";
        if (!match) {
          const date = (raw[iDate] ?? "").slice(0, 10);
          const cands = this.d.payments.filter(
            (p) => p.amount === amount && p.submittedAt.slice(0, 10) === date && !p.utr,
          );
          if (cands.length === 1) {
            match = cands[0];
            confidence = "probable";
          }
        }

        const rec: Settlement = {
          id: uid("stl"),
          bankRef,
          amount,
          valueDate: (raw[iDate] ?? nowIso()).slice(0, 10),
          narration: (raw[iNarr] ?? "").trim(),
          matchedPaymentId: match?.id ?? null,
          matchConfidence: confidence,
          importedAt: nowIso(),
        };
        this.d.settlements.push(rec);
        this.save("settlements", rec);
        imported++;
        if (match) matched++;
      }
      this.log("settlement.imported", "settlement", "*", null, { imported, matched });
      return { imported, matched };
    },

    match: async (settlementId: string, paymentId: string) => {
      this.assertCan("settlements.reconcile");
      const rec = this.d.settlements.find((s) => s.id === settlementId);
      if (!rec) throw new DataError("NOT_FOUND");
      rec.matchedPaymentId = paymentId;
      rec.matchConfidence = "probable";
      this.save("settlements", rec);
      this.log("settlement.matched", "settlement", settlementId, null, { paymentId });
      return clone(rec);
    },

    unmatch: async (settlementId: string) => {
      this.assertCan("settlements.reconcile");
      const rec = this.d.settlements.find((s) => s.id === settlementId);
      if (!rec) throw new DataError("NOT_FOUND");
      const before = { matchedPaymentId: rec.matchedPaymentId };
      rec.matchedPaymentId = null;
      rec.matchConfidence = "none";
      this.save("settlements", rec);
      this.log("settlement.unmatched", "settlement", settlementId, before, null);
      return clone(rec);
    },

    unmatched: async () => {
      const matchedIds = new Set(
        this.d.settlements.filter((s) => s.matchedPaymentId).map((s) => s.matchedPaymentId!),
      );
      return clone({
        inBank: this.d.settlements.filter((s) => !s.matchedPaymentId),
        inApp: this.d.payments.filter(
          (p) => p.status === "verified" && p.method !== "cash" && !matchedIds.has(p.id),
        ),
      });
    },
  };

  // =========================================================================
  // coupons
  // =========================================================================

  coupons = {
    list: async () => clone(this.d.coupons),
    create: async (input: Omit<Coupon, "id" | "usedCount">) => {
      if (this.d.coupons.some((c) => c.code.toLowerCase() === input.code.toLowerCase()))
        throw new DataError("VALIDATION_FAILED", "Coupon code already exists");
      const rec: Coupon = { ...input, id: uid("cpn"), usedCount: 0 };
      this.d.coupons.push(rec);
      this.save("coupons", rec);
      this.log("coupon.created", "coupon", rec.id, null, { code: rec.code });
      return clone(rec);
    },
    update: async (id: string, patch: Partial<Coupon>) => {
      const rec = this.d.coupons.find((c) => c.id === id);
      if (!rec) throw new DataError("NOT_FOUND");
      Object.assign(rec, patch);
      this.save("coupons", rec);
      this.log("coupon.updated", "coupon", id, null, patch as Record<string, unknown>);
      return clone(rec);
    },
  };

  // =========================================================================
  // colleges
  // =========================================================================

  colleges = {
    list: async () => clone(this.d.colleges),
    get: async (id: string) => clone(this.d.colleges.find((c) => c.id === id) ?? null),

    contingents: async () => {
      return clone(
        this.d.colleges
          .map((college) => {
            const people = this.d.participants.filter((p) => p.collegeId === college.id);
            const ids = new Set(people.map((p) => p.id));
            const confirmed = this.d.registrations.filter(
              (r) => ids.has(r.participantId) && r.status === "confirmed",
            ).length;
            let paid = 0;
            let due = 0;
            for (const p of people) {
              const np = this.netPaid(p.id);
              paid += np;
              due += Math.max(0, this.grossDue(p.id) - np);
            }
            const arrivals = this.d.travel
              .filter((t) => ids.has(t.participantId) && t.direction === "arrival")
              .map((t) => t.scheduledAt)
              .sort();
            return {
              college,
              participants: people.length,
              confirmed,
              paid,
              due,
              accommodation: this.d.allotments.filter((a) => ids.has(a.participantId)).length,
              arrivalAt: arrivals[0] ?? null,
            };
          })
          .filter((c) => c.participants > 0)
          .sort((a, b) => b.participants - a.participants),
      );
    },

    setVerified: async (id: string, verified: boolean) => {
      this.assertCan("events.manage");
      const rec = this.d.colleges.find((c) => c.id === id);
      if (!rec) throw new DataError("NOT_FOUND");
      const before = { isVerified: rec.isVerified };
      rec.isVerified = verified;
      this.save("colleges", rec);
      this.log("college.verification_changed", "college", id, before, { isVerified: verified });
      return clone(rec);
    },
  };

  // =========================================================================
  // events
  // =========================================================================

  events = {
    list: async () => clone(this.d.events),
    get: async (id: string) => clone(this.d.events.find((e) => e.id === id) ?? null),

    stats: async (eventId: string): Promise<EventStats> => {
      const regs = this.d.registrations.filter((r) => r.eventId === eventId);
      const ev = this.d.events.find((e) => e.id === eventId);
      const confirmedCount = regs.filter((r) => r.status === "confirmed").length;
      const pendingCount = regs.filter((r) => r.status === "pending").length;
      const ids = new Set(regs.map((r) => r.id));
      const revenue = this.d.payments
        .filter((p) => p.status === "verified" && p.registrationIds.some((r) => ids.has(r)))
        .reduce((s, p) => s + p.breakdown.filter((b) => b.kind === "event" && b.refId && ids.has(b.refId)).reduce((x, b) => x + b.amount, 0), 0);
      return {
        eventId,
        confirmedCount,
        pendingCount,
        waitlistCount: regs.filter((r) => r.status === "waitlisted").length,
        checkedInCount: this.d.attendance.filter((a) => a.eventId === eventId).length,
        capacity: ev?.capacity ?? null,
        seatsLeft: ev?.capacity != null ? ev.capacity - confirmedCount - pendingCount : null,
        revenue,
      };
    },

    allStats: async () => Promise.all(this.d.events.map((e) => this.events.stats(e.id))),

    update: async (id: string, patch: Partial<FestEvent>) => {
      this.assertCan("events.manage");
      const rec = this.d.events.find((e) => e.id === id);
      if (!rec) throw new DataError("NOT_FOUND");
      const before: Record<string, unknown> = {};
      for (const k of Object.keys(patch)) before[k] = (rec as unknown as Record<string, unknown>)[k];
      Object.assign(rec, patch);
      this.save("events", rec);
      this.log("event.updated", "event", id, before, patch as Record<string, unknown>);
      return clone(rec);
    },

    venueClashes: async () => {
      const out: { a: FestEvent; b: FestEvent }[] = [];
      const evs = this.d.events.filter((e) => e.status !== "cancelled");
      for (let i = 0; i < evs.length; i++)
        for (let j = i + 1; j < evs.length; j++) {
          const a = evs[i];
          const b = evs[j];
          if (a.venue !== b.venue) continue;
          if (a.startsAt < b.endsAt && b.startsAt < a.endsAt) out.push({ a, b });
        }
      return clone(out);
    },
  };

  // =========================================================================
  // teams
  // =========================================================================

  teams = {
    list: async (eventId?: string) =>
      clone(eventId ? this.d.teams.filter((t) => t.eventId === eventId) : this.d.teams),

    get: async (id: string) => clone(this.d.teams.find((t) => t.id === id) ?? null),

    create: async (input: { eventId: string; name: string; leaderParticipantId: string }) => {
      const ev = this.d.events.find((e) => e.id === input.eventId);
      this.assertCan("registrations.write");
      if (!ev) throw new DataError("NOT_FOUND", "Event not found");
      const rec: Team = {
        id: uid("tm"),
        eventId: input.eventId,
        name: input.name,
        joinCode: `AUR${Math.floor(Math.random() * 900 + 100)}`,
        leaderParticipantId: input.leaderParticipantId,
        memberIds: [input.leaderParticipantId],
        isLocked: false,
        createdAt: nowIso(),
      };
      this.d.teams.push(rec);
      this.save("teams", rec);
      this.log("team.created", "team", rec.id, null, { name: rec.name, event: ev.title });
      return clone(rec);
    },

    addMember: async (teamId: string, participantId: string) => {
      this.assertCan("registrations.write");
      const t = this.d.teams.find((x) => x.id === teamId);
      if (!t) throw new DataError("NOT_FOUND");
      if (t.isLocked) throw new DataError("TEAM_LOCKED", "Roster is locked");
      const ev = this.d.events.find((e) => e.id === t.eventId);
      if (ev && t.memberIds.length >= ev.maxTeamSize)
        throw new DataError("TEAM_FULL", `Maximum ${ev.maxTeamSize} members`);
      if (t.memberIds.includes(participantId)) return clone(t);
      t.memberIds.push(participantId);
      this.save("teams", t);
      this.log("team.member_added", "team", teamId, null, { participantId });
      return clone(t);
    },

    removeMember: async (teamId: string, participantId: string) => {
      this.assertCan("registrations.write");
      const t = this.d.teams.find((x) => x.id === teamId);
      if (!t) throw new DataError("NOT_FOUND");
      if (t.isLocked) throw new DataError("TEAM_LOCKED", "Roster is locked");
      t.memberIds = t.memberIds.filter((m) => m !== participantId);
      this.save("teams", t);
      this.log("team.member_removed", "team", teamId, { participantId }, null);
      return clone(t);
    },

    setLocked: async (teamId: string, locked: boolean) => {
      this.assertCan("registrations.write");
      const t = this.d.teams.find((x) => x.id === teamId);
      if (!t) throw new DataError("NOT_FOUND");
      t.isLocked = locked;
      this.save("teams", t);
      this.log(locked ? "team.locked" : "team.unlocked", "team", teamId, null, { isLocked: locked });
      return clone(t);
    },

    incomplete: async () => {
      const out: { team: Team; event: FestEvent; short: number }[] = [];
      for (const t of this.d.teams) {
        const ev = this.d.events.find((e) => e.id === t.eventId);
        if (!ev || ev.status === "cancelled") continue;
        if (t.memberIds.length < ev.minTeamSize)
          out.push({ team: t, event: ev, short: ev.minTeamSize - t.memberIds.length });
      }
      return clone(out.sort((a, b) => b.short - a.short));
    },

    substitutions: async () => clone(this.d.substitutions),

    requestSubstitution: async (input: {
      teamId: string;
      outParticipantId: string;
      inParticipantId: string;
      reason: string;
    }) => {
      const rec: SubstitutionRequest = {
        id: uid("sub"),
        ...input,
        status: "pending",
        requestedAt: nowIso(),
        reviewedBy: null,
        reviewedAt: null,
      };
      this.d.substitutions.push(rec);
      this.save("substitutions", rec);
      this.log("substitution.requested", "substitution", rec.id, null, { teamId: input.teamId });
      return clone(rec);
    },

    reviewSubstitution: async (id: string, decision: "approved" | "rejected") => {
      const actor = this.assertCan("registrations.write");
      const rec = this.d.substitutions.find((s) => s.id === id);
      if (!rec) throw new DataError("NOT_FOUND");
      const before = { status: rec.status };
      rec.status = decision;
      rec.reviewedBy = actor.id;
      rec.reviewedAt = nowIso();
      this.save("substitutions", rec);

      if (decision === "approved") {
        const t = this.d.teams.find((x) => x.id === rec.teamId);
        if (t) {
          t.memberIds = t.memberIds.map((m) =>
            m === rec.outParticipantId ? rec.inParticipantId : m,
          );
          this.save("teams", t);
        }
      }
      this.log(`substitution.${decision}`, "substitution", id, before, { status: decision });
      return clone(rec);
    },
  };

  // =========================================================================
  // documents
  // =========================================================================

  documents = {
    list: async (status?: string) =>
      clone(status ? this.d.documents.filter((d) => d.status === status) : this.d.documents),

    forParticipant: async (participantId: string) =>
      clone(this.d.documents.filter((d) => d.participantId === participantId)),

    queue: async () =>
      clone(
        this.d.documents
          .filter((d) => d.status === "pending")
          .sort((a, b) => (a.submittedAt < b.submittedAt ? -1 : 1)),
      ),

    review: async (id: string, decision: "approved" | "rejected" | "resubmit", note?: string) => {
      const actor = this.assertCan("documents.review");
      const rec = this.d.documents.find((d) => d.id === id);
      if (!rec) throw new DataError("NOT_FOUND");
      if (rec.status === decision) return clone(rec);
      const before = { status: rec.status };
      rec.status = decision;
      rec.reviewedBy = actor.id;
      rec.reviewedAt = nowIso();
      rec.reviewNote = note ?? null;
      this.save("documents", rec);
      this.log(`document.${decision}`, "document", id, before, { status: decision }, note);
      return clone(rec);
    },

    completeness: async () => {
      const byParticipant = new Map<string, DocumentSubmission[]>();
      for (const d of this.d.documents)
        byParticipant.set(d.participantId, [...(byParticipant.get(d.participantId) ?? []), d]);

      return this.d.participants.map((p) => {
        const required = this.requiredDocsFor(p);
        const approved = (byParticipant.get(p.id) ?? [])
          .filter((d) => d.status === "approved")
          .map((d) => d.docType as string);
        return {
          participantId: p.id,
          required,
          approved,
          missing: required.filter((r) => !approved.includes(r)),
        };
      });
    },
  };

  // =========================================================================
  // accommodation
  // =========================================================================

  accommodation = {
    requests: async (status?: string) =>
      clone(status ? this.d.accommodation.filter((a) => a.status === status) : this.d.accommodation),

    allotments: async () => clone(this.d.allotments),

    occupancy: async () =>
      HOSTEL_BLOCKS.map((b) => ({
        blockId: b.id,
        name: b.name,
        gender: b.gender,
        capacity: b.floors * b.roomsPerFloor * b.bedsPerRoom,
        occupied: this.d.allotments.filter((a) => a.blockId === b.id).length,
      })),

    allot: async (requestId: string, blockId: string, roomNo: string, bedNo: number) => {
      // Authorisation FIRST, before any lookup. Validating the id first leaks
      // whether a record exists to someone with no right to know.
      const actor = this.assertCan("accommodation.allot");
      const req = this.d.accommodation.find((a) => a.id === requestId);
      if (!req) throw new DataError("NOT_FOUND", "Request not found");
      const block = HOSTEL_BLOCKS.find((b) => b.id === blockId);
      if (!block) throw new DataError("NOT_FOUND", "Block not found");

      // A bed is a physical resource — every gate here corresponds to a real
      // problem the hostel desk hits at 11pm on arrival night.
      if (block.gender !== "any" && block.gender !== req.gender)
        throw new DataError(
          "GENDER_MISMATCH",
          `${block.name} is a ${block.gender} block; request is ${req.gender}`,
        );

      const paid = this.netPaid(req.participantId);
      const due = this.grossDue(req.participantId) - paid;
      if (due > 0)
        throw new DataError("PAYMENT_NOT_VERIFIED", `₹${due} still outstanding — cannot allot`);

      const p = this.d.participants.find((x) => x.id === req.participantId);
      if (p) {
        const required = this.requiredDocsFor(p).filter((r) => {
          const dt = DOC_TYPES.find((x) => x.id === r);
          return (dt?.gates as readonly string[] | undefined)?.includes("accommodation");
        });
        const approved = this.d.documents
          .filter((dd) => dd.participantId === p.id && dd.status === "approved")
          .map((dd) => dd.docType as string);
        const missing = required.filter((r) => !approved.includes(r));
        if (missing.length)
          throw new DataError("DOCS_INCOMPLETE", `Missing: ${missing.join(", ")}`);
      }

      const occupied = this.d.allotments.filter(
        (a) => a.blockId === blockId && a.roomNo === roomNo,
      );
      if (occupied.length >= block.bedsPerRoom)
        throw new DataError("ROOM_FULL", `Room ${roomNo} has all ${block.bedsPerRoom} beds taken`);
      if (occupied.some((a) => a.bedNo === bedNo))
        throw new DataError("ROOM_FULL", `Bed ${bedNo} in room ${roomNo} is taken`);

      const rec: RoomAllotment = {
        id: uid("alt"),
        requestId,
        participantId: req.participantId,
        blockId,
        roomNo,
        bedNo,
        allottedBy: actor.id,
        allottedAt: nowIso(),
        checkedInAt: null,
        checkedOutAt: null,
        keyIssued: false,
        beddingIssued: false,
        itemsReturned: false,
      };
      this.d.allotments.push(rec);
      this.save("allotments", rec);
      req.status = "allotted";
      this.save("accommodation", req);
      this.log("accommodation.allotted", "allotment", rec.id, null, { blockId, roomNo, bedNo });
      return clone(rec);
    },

    autoAllot: async (requestIds: string[]) => {
      let allotted = 0;
      const failed: { id: string; reason: string }[] = [];
      for (const id of requestIds) {
        const req = this.d.accommodation.find((a) => a.id === id);
        if (!req) continue;
        const blocks = HOSTEL_BLOCKS.filter(
          (b) => b.gender === req.gender || b.gender === "any",
        );
        let placed = false;
        outer: for (const b of blocks) {
          for (let f = 1; f <= b.floors; f++)
            for (let r = 1; r <= b.roomsPerFloor; r++) {
              const roomNo = `${f}${pad(r, 2)}`;
              const used = this.d.allotments.filter(
                (a) => a.blockId === b.id && a.roomNo === roomNo,
              );
              if (used.length >= b.bedsPerRoom) continue;
              const bed = [...Array(b.bedsPerRoom).keys()]
                .map((n) => n + 1)
                .find((n) => !used.some((u) => u.bedNo === n));
              if (!bed) continue;
              try {
                await this.accommodation.allot(id, b.id, roomNo, bed);
                allotted++;
                placed = true;
                break outer;
              } catch (e) {
                failed.push({ id, reason: e instanceof DataError ? e.message : "Unknown error" });
                placed = true;
                break outer;
              }
            }
        }
        if (!placed) failed.push({ id, reason: "No bed available in a matching block" });
      }
      return { allotted, failed };
    },

    release: async (allotmentId: string) => {
      this.assertCan("accommodation.allot");
      const i = this.d.allotments.findIndex((a) => a.id === allotmentId);
      if (i < 0) throw new DataError("NOT_FOUND");
      const rec = this.d.allotments[i];
      this.d.allotments.splice(i, 1);
      this.remove("allotments", allotmentId);
      const req = this.d.accommodation.find((a) => a.id === rec.requestId);
      if (req) {
        req.status = "requested";
        this.save("accommodation", req);
      }
      this.log("accommodation.released", "allotment", allotmentId, { roomNo: rec.roomNo }, null);
    },

    checkIn: async (allotmentId: string, opts: { keyIssued: boolean; beddingIssued: boolean }) => {
      this.assertCan("accommodation.allot");
      const rec = this.d.allotments.find((a) => a.id === allotmentId);
      if (!rec) throw new DataError("NOT_FOUND");
      if (rec.checkedInAt) return clone(rec);
      rec.checkedInAt = nowIso();
      rec.keyIssued = opts.keyIssued;
      rec.beddingIssued = opts.beddingIssued;
      this.save("allotments", rec);
      const req = this.d.accommodation.find((a) => a.id === rec.requestId);
      if (req) {
        req.status = "checked_in";
        this.save("accommodation", req);
      }
      this.log("accommodation.checked_in", "allotment", allotmentId, null, opts);
      return clone(rec);
    },

    checkOut: async (allotmentId: string, itemsReturned: boolean) => {
      this.assertCan("accommodation.allot");
      const rec = this.d.allotments.find((a) => a.id === allotmentId);
      if (!rec) throw new DataError("NOT_FOUND");
      rec.checkedOutAt = nowIso();
      rec.itemsReturned = itemsReturned;
      this.save("allotments", rec);
      const req = this.d.accommodation.find((a) => a.id === rec.requestId);
      if (req) {
        req.status = "checked_out";
        this.save("accommodation", req);
      }
      this.log("accommodation.checked_out", "allotment", allotmentId, null, { itemsReturned });
      return clone(rec);
    },

    mealCoupons: async (participantId: string) =>
      clone(this.d.mealCoupons.filter((m) => m.participantId === participantId)),

    issueMealCoupons: async (participantId: string, days: string[]) => {
      const out: MealCoupon[] = [];
      for (const day of days)
        for (const meal of MEALS) {
          const exists = this.d.mealCoupons.some(
            (m) => m.participantId === participantId && m.day === day && m.meal === meal.id,
          );
          if (exists) continue;
          const rec: MealCoupon = {
            id: uid("mc"),
            participantId,
            day,
            meal: meal.id,
            issuedAt: nowIso(),
            redeemedAt: null,
          };
          this.d.mealCoupons.push(rec);
          this.save("mealCoupons", rec);
          out.push(rec);
        }
      this.log("meal.issued", "participant", participantId, null, { days, count: out.length });
      return clone(out);
    },

    redeemMealCoupon: async (id: string) => {
      const rec = this.d.mealCoupons.find((m) => m.id === id);
      if (!rec) throw new DataError("NOT_FOUND");
      if (rec.redeemedAt) return clone(rec);
      rec.redeemedAt = nowIso();
      this.save("mealCoupons", rec);
      return clone(rec);
    },
  };

  // =========================================================================
  // travel
  // =========================================================================

  travel = {
    records: async (direction?: "arrival" | "departure") =>
      clone(direction ? this.d.travel.filter((t) => t.direction === direction) : this.d.travel),

    slots: async () => clone(this.d.pickupSlots),

    createSlot: async (input: Omit<PickupSlot, "id" | "status">) => {
      this.assertCan("travel.manage");
      const rec: PickupSlot = { ...input, id: uid("pks"), status: "planned" };
      this.d.pickupSlots.push(rec);
      this.save("pickupSlots", rec);
      this.log("travel.slot_created", "pickupSlot", rec.id, null, { station: rec.station });
      return clone(rec);
    },

    assignToSlot: async (travelId: string, slotId: string) => {
      this.assertCan("travel.manage");
      const rec = this.d.travel.find((t) => t.id === travelId);
      if (!rec) throw new DataError("NOT_FOUND");
      const slot = this.d.pickupSlots.find((s) => s.id === slotId);
      if (!slot) throw new DataError("NOT_FOUND", "Slot not found");
      const load = this.d.travel.filter((t) => t.pickupSlotId === slotId).length;
      if (load >= slot.capacity)
        throw new DataError("VALIDATION_FAILED", `${slot.vehicle} is at capacity (${slot.capacity})`);
      rec.pickupSlotId = slotId;
      this.save("travel", rec);
      this.log("travel.assigned", "travel", travelId, null, { slotId });
      return clone(rec);
    },

    setSlotStatus: async (slotId: string, status: PickupSlot["status"]) => {
      this.assertCan("travel.manage");
      const rec = this.d.pickupSlots.find((s) => s.id === slotId);
      if (!rec) throw new DataError("NOT_FOUND");
      const before = { status: rec.status };
      rec.status = status;
      this.save("pickupSlots", rec);
      this.log("travel.slot_status", "pickupSlot", slotId, before, { status });
      return clone(rec);
    },

    setTravelStatus: async (id: string, status: TravelRecord["status"]) => {
      const rec = this.d.travel.find((t) => t.id === id);
      if (!rec) throw new DataError("NOT_FOUND");
      rec.status = status;
      this.save("travel", rec);
      return clone(rec);
    },
  };

  // =========================================================================
  // attendance
  // =========================================================================

  attendance = {
    list: async (day?: string, eventId?: string) => {
      let rows = this.d.attendance;
      if (day) rows = rows.filter((a) => a.day === day);
      if (eventId) rows = rows.filter((a) => a.eventId === eventId);
      return clone(rows);
    },

    checkIn: async (input: {
      participantId: string;
      eventId?: string | null;
      method?: "qr" | "manual" | "self";
    }) => {
      // Authorisation FIRST — before the idempotency short-circuit below, which
      // would otherwise return success to an unauthorised caller for anyone who
      // happened to be checked in already.
      const actor = this.assertCan("attendance.checkin");

      // Idempotent — the gate volunteer will scan the same badge twice.
      const existing = this.d.attendance.find(
        (a) =>
          a.participantId === input.participantId &&
          a.eventId === (input.eventId ?? null) &&
          a.day === this.currentDayKey(),
      );
      if (existing) return { record: clone(existing), wasAlready: true };

      const reg = input.eventId
        ? this.d.registrations.find(
            (r) => r.participantId === input.participantId && r.eventId === input.eventId,
          )
        : null;

      const rec: Attendance = {
        id: uid("att"),
        participantId: input.participantId,
        eventId: input.eventId ?? null,
        registrationId: reg?.id ?? null,
        method: input.method ?? "qr",
        checkedInAt: nowIso(),
        scannedBy: actor.id,
        day: this.currentDayKey(),
      };
      this.d.attendance.push(rec);
      this.save("attendance", rec);
      this.log("attendance.checked_in", "attendance", rec.id, null, {
        participantId: input.participantId,
        eventId: input.eventId ?? null,
      });
      return { record: clone(rec), wasAlready: false };
    },

    noShows: async (eventId: string) => {
      const present = new Set(
        this.d.attendance.filter((a) => a.eventId === eventId).map((a) => a.participantId),
      );
      return clone(
        this.d.registrations.filter(
          (r) => r.eventId === eventId && r.status === "confirmed" && !present.has(r.participantId),
        ),
      );
    },
  };

  private currentDayKey(): string {
    const today = now().toISOString().slice(0, 10);
    return FEST.days.find((d) => d.date === today)?.key ?? FEST.days[0].key;
  }

  // =========================================================================
  // desk
  // =========================================================================

  desk = {
    shifts: async () => clone(this.d.shifts),

    openShift: async (input: { staffId: string; deskName: string; openingFloat: number }) => {
      this.assertCan("payments.collect");
      const rec: DeskShift = {
        id: uid("shf"),
        staffId: input.staffId,
        deskName: input.deskName,
        day: this.currentDayKey(),
        startsAt: nowIso(),
        endsAt: new Date(now().getTime() + 6 * 3600000).toISOString(),
        status: "open",
        openingFloat: input.openingFloat,
        expectedCash: 0,
        countedCash: null,
        handoverTo: null,
        closedAt: null,
      };
      this.d.shifts.push(rec);
      this.save("shifts", rec);
      this.log("desk.shift_opened", "shift", rec.id, null, { deskName: rec.deskName });
      return clone(rec);
    },

    closeShift: async (id: string, countedCash: number, handoverTo: string) => {
      this.assertCan("payments.collect");
      const rec = this.d.shifts.find((s) => s.id === id);
      if (!rec) throw new DataError("NOT_FOUND");
      rec.status = "closed";
      rec.countedCash = countedCash;
      rec.handoverTo = handoverTo;
      rec.closedAt = nowIso();
      this.save("shifts", rec);
      const variance = countedCash - (rec.expectedCash + rec.openingFloat);
      this.log(
        "desk.shift_closed",
        "shift",
        id,
        { expected: rec.expectedCash + rec.openingFloat },
        { counted: countedCash, variance },
        variance === 0 ? "Balanced" : `Variance ₹${variance}`,
      );
      return clone(rec);
    },

    currentShift: async () => clone(this.d.shifts.find((s) => s.status === "open") ?? null),

    tokens: async () => clone(this.d.tokens),

    issueToken: async (purpose: QueueToken["purpose"], deskName: string) => {
      const max = this.d.tokens.reduce((m, t) => Math.max(m, t.number), 100);
      const rec: QueueToken = {
        id: uid("tok"),
        number: max + 1,
        deskName,
        issuedAt: nowIso(),
        servedAt: null,
        purpose,
      };
      this.d.tokens.push(rec);
      this.save("tokens", rec);
      return clone(rec);
    },

    serveToken: async (id: string) => {
      const rec = this.d.tokens.find((t) => t.id === id);
      if (!rec) throw new DataError("NOT_FOUND");
      rec.servedAt = nowIso();
      this.save("tokens", rec);
      return clone(rec);
    },

    kits: async () => clone(this.d.kits),

    issueKit: async (input: { participantId: string; items: string[]; signature: boolean }) => {
      const actor = this.assertCan("registrations.write");
      const existing = this.d.kits.find((k) => k.participantId === input.participantId);
      if (existing)
        throw new DataError("VALIDATION_FAILED", "Kit already issued to this participant");
      const p = this.d.participants.find((x) => x.id === input.participantId);
      const rec: KitIssue = {
        id: uid("kit"),
        participantId: input.participantId,
        tshirtSize: p?.tshirtSize ?? "M",
        items: input.items,
        issuedAt: nowIso(),
        issuedBy: actor.id,
        signature: input.signature,
      };
      this.d.kits.push(rec);
      this.save("kits", rec);
      this.log("desk.kit_issued", "kit", rec.id, null, { participantId: input.participantId });
      return clone(rec);
    },
  };

  // =========================================================================
  // comms
  // =========================================================================

  comms = {
    templates: async () => clone(this.d.templates),

    saveTemplate: async (t: Omit<MessageTemplate, "updatedAt">) => {
      const existing = this.d.templates.find((x) => x.id === t.id);
      const rec: MessageTemplate = { ...t, updatedAt: nowIso() };
      if (existing) Object.assign(existing, rec);
      else this.d.templates.push(rec);
      this.save("templates", rec);
      this.log("comms.template_saved", "template", rec.id, null, { name: rec.name });
      return clone(rec);
    },

    broadcasts: async () => clone(this.d.broadcasts),

    previewAudience: async (filter: RegistrationFilter & ParticipantFilter) => {
      const regs = await this.registrations.list(filter);
      const ids = new Set(regs.map((r) => r.participantId));
      let people = this.d.participants.filter((p) => ids.has(p.id));
      // Some audiences are participant-shaped rather than registration-shaped.
      if (!Object.keys(filter).some((k) => k in ({} as RegistrationFilter)) && filter.hasDues) {
        people = await this.participants.list(filter);
      }
      if (filter.collegeId) people = people.filter((p) => p.collegeId === filter.collegeId);
      if (filter.category) people = people.filter((p) => p.category === filter.category);
      return clone(people);
    },

    send: async (input: {
      templateId: string;
      name: string;
      audience: RegistrationFilter & ParticipantFilter;
      scheduledAt?: string | null;
    }) => {
      const actor = this.assertCan("comms.send");
      const tpl = this.d.templates.find((t) => t.id === input.templateId);
      if (!tpl) throw new DataError("NOT_FOUND", "Template not found");
      const people = await this.comms.previewAudience(input.audience);

      const rec: Broadcast = {
        id: uid("bc"),
        templateId: input.templateId,
        name: input.name,
        audience: input.audience as Record<string, unknown>,
        audienceCount: people.length,
        channel: tpl.channel,
        status: input.scheduledAt ? "scheduled" : "sent",
        scheduledAt: input.scheduledAt ?? null,
        sentAt: input.scheduledAt ? null : nowIso(),
        sentCount: input.scheduledAt ? 0 : people.length,
        failedCount: 0,
        createdBy: actor.id,
      };
      this.d.broadcasts.push(rec);
      this.save("broadcasts", rec);

      if (!input.scheduledAt) {
        // Log a sample rather than 2,000 rows — the mock is not a mail server.
        for (const p of people.slice(0, 100)) {
          const log: MessageLog = {
            id: uid("msg"),
            broadcastId: rec.id,
            participantId: p.id,
            channel: tpl.channel,
            subject: tpl.subject,
            status: "delivered",
            sentAt: nowIso(),
            error: null,
          };
          this.d.messageLogs.push(log);
          this.save("messageLogs", log);
        }
      }
      this.log("comms.broadcast_sent", "broadcast", rec.id, null, {
        name: rec.name,
        audienceCount: rec.audienceCount,
      });
      return clone(rec);
    },

    logs: async (broadcastId?: string) =>
      clone(
        broadcastId
          ? this.d.messageLogs.filter((m) => m.broadcastId === broadcastId)
          : this.d.messageLogs,
      ),
  };

  // =========================================================================
  // certificates
  // =========================================================================

  certificates = {
    list: async () => clone(this.d.certificates),

    issueBulk: async (input: {
      eventId: string | null;
      kind: CertificateIssue["kind"];
      participantIds: string[];
    }) => {
      const actor = this.assertCan("certificates.issue");
      let issued = 0;
      const skipped: { participantId: string; reason: string }[] = [];

      for (const pid of input.participantIds) {
        // You cannot certify someone who never turned up.
        const attended = this.d.attendance.some(
          (a) => a.participantId === pid && (input.eventId ? a.eventId === input.eventId : true),
        );
        if (!attended && input.kind !== "volunteer") {
          skipped.push({ participantId: pid, reason: "No attendance recorded" });
          continue;
        }
        const dupe = this.d.certificates.some(
          (c) =>
            c.participantId === pid &&
            c.eventId === input.eventId &&
            c.kind === input.kind &&
            !c.revokedAt,
        );
        if (dupe) {
          skipped.push({ participantId: pid, reason: "Already issued" });
          continue;
        }
        const n = this.d.certificates.length + 1;
        const rec: CertificateIssue = {
          id: uid("crt"),
          serial: `${FEST.serials.certificate}/${pad(n, 5)}`,
          participantId: pid,
          eventId: input.eventId,
          kind: input.kind,
          issuedAt: nowIso(),
          issuedBy: actor.id,
          revokedAt: null,
          verifyToken: cheapHash(`${pid}-${input.eventId}-${input.kind}-${n}`),
        };
        this.d.certificates.push(rec);
        this.save("certificates", rec);
        issued++;
      }
      this.log("certificate.bulk_issued", "certificate", "*", null, {
        issued,
        skipped: skipped.length,
        kind: input.kind,
      });
      return { issued, skipped };
    },

    revoke: async (id: string, reason: string) => {
      this.assertCan("certificates.issue");
      const rec = this.d.certificates.find((c) => c.id === id);
      if (!rec) throw new DataError("NOT_FOUND");
      rec.revokedAt = nowIso();
      this.save("certificates", rec);
      this.log("certificate.revoked", "certificate", id, null, { reason }, reason);
      return clone(rec);
    },

    verify: async (token: string) =>
      clone(this.d.certificates.find((c) => c.verifyToken === token) ?? null),
  };

  // =========================================================================
  // helpdesk
  // =========================================================================

  helpdesk = {
    list: async (status?: string) =>
      clone(status ? this.d.tickets.filter((t) => t.status === status) : this.d.tickets),

    create: async (
      input: Omit<
        HelpdeskTicket,
        "id" | "code" | "createdAt" | "updatedAt" | "resolvedAt" | "resolutionNote" | "status"
      >,
    ) => {
      const rec: HelpdeskTicket = {
        ...input,
        id: uid("tkt"),
        code: `HD-${pad(this.d.tickets.length + 1, 4)}`,
        status: "open",
        createdAt: nowIso(),
        updatedAt: nowIso(),
        resolvedAt: null,
        resolutionNote: null,
      };
      this.d.tickets.push(rec);
      this.save("tickets", rec);
      this.log("ticket.created", "ticket", rec.id, null, { code: rec.code, subject: rec.subject });
      return clone(rec);
    },

    update: async (id: string, patch: Partial<HelpdeskTicket>) => {
      const rec = this.d.tickets.find((t) => t.id === id);
      if (!rec) throw new DataError("NOT_FOUND");
      const before: Record<string, unknown> = {};
      for (const k of Object.keys(patch)) before[k] = (rec as unknown as Record<string, unknown>)[k];
      Object.assign(rec, patch, { updatedAt: nowIso() });
      this.save("tickets", rec);
      this.log("ticket.updated", "ticket", id, before, patch as Record<string, unknown>);
      return clone(rec);
    },

    resolve: async (id: string, note: string) => {
      this.assertCan("helpdesk.manage");
      const rec = this.d.tickets.find((t) => t.id === id);
      if (!rec) throw new DataError("NOT_FOUND");
      const before = { status: rec.status };
      rec.status = "resolved";
      rec.resolvedAt = nowIso();
      rec.resolutionNote = note;
      rec.updatedAt = nowIso();
      this.save("tickets", rec);
      this.log("ticket.resolved", "ticket", id, before, { status: "resolved" }, note);
      return clone(rec);
    },
  };

  // =========================================================================
  // staff, audit, views, admin
  // =========================================================================

  staff = {
    list: async () => clone(this.d.staff),

    update: async (id: string, patch: Partial<StaffMember>) => {
      const actor = this.assertCan("staff.manageRoles");
      const rec = this.d.staff.find((s) => s.id === id);
      if (!rec) throw new DataError("NOT_FOUND");
      if (patch.role && actor.role !== "head")
        throw new DataError("FORBIDDEN", "Only the Registration Head can change roles");
      const before: Record<string, unknown> = {};
      for (const k of Object.keys(patch)) before[k] = (rec as unknown as Record<string, unknown>)[k];
      Object.assign(rec, patch);
      this.save("staff", rec);
      this.log("staff.updated", "staff", id, before, patch as Record<string, unknown>);
      return clone(rec);
    },

    workload: async () =>
      this.d.staff.map((s) => ({
        staffId: s.id,
        verifications: this.d.payments.filter((p) => p.reviewedBy === s.id).length,
        walkIns: this.d.attendance.filter((a) => a.scannedBy === s.id).length,
        tickets: this.d.tickets.filter((t) => t.assignedTo === s.id && t.resolvedAt).length,
      })),
  };

  audit = {
    list: async (filter?: { entity?: string; actorId?: string; action?: string; limit?: number }) => {
      let rows = this.d.audit;
      if (filter?.entity) rows = rows.filter((a) => a.entity === filter.entity);
      if (filter?.actorId) rows = rows.filter((a) => a.actorId === filter.actorId);
      if (filter?.action) rows = rows.filter((a) => a.action.includes(filter.action!));
      return clone(rows.slice(0, filter?.limit ?? 500));
    },
  };

  views = {
    list: async (scope: string) => clone(this.d.views.filter((v) => v.scope === scope)),
    create: async (input: Omit<SavedView, "id">) => {
      const rec: SavedView = { ...input, id: uid("vw") };
      this.d.views.push(rec);
      this.save("views", rec);
      return clone(rec);
    },
    remove: async (id: string) => {
      const i = this.d.views.findIndex((v) => v.id === id);
      if (i >= 0) {
        this.d.views.splice(i, 1);
        this.remove("views", id);
      }
    },
  };

  admin = {
    /**
     * Derived from the session. There is deliberately no setter — the old
     * "act as anyone" picker was a one-click privilege escalation once real
     * accounts existed.
     */
    actor: async (): Promise<Actor | null> => {
      const s = this.currentStaff();
      return s ? { id: s.id, name: s.name, role: s.role } : null;
    },

    reset: async (seed?: number) => {
      clockOffsetMs = 0;
      this.s = resetStore(seed);
      this.version++;
      // Drop the session too: a token pointing at a staff record that has just
      // been regenerated leaves the console half-signed-in.
      sessionStore.clear();
    },

    tick: async () => {
      clockOffsetMs += 60_000;
    },
  };
}

export const mockRepository = new MockRepository();
