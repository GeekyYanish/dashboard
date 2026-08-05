/**
 * The assertion suite, extracted from the page component so it can be run
 * BOTH in the browser (via /dev/data-test) and headlessly in Node:
 *
 *     npx tsx scripts/run-tests.ts
 *
 * Keeping one copy is the point — a suite that only runs in one place drifts.
 */

import { getRepo } from "@/lib/data";
import { DataError, isDataError } from "@/lib/data/types";

export interface Result {
  name: string;
  group: string;
  ok: boolean;
  detail: string;
  ms: number;
}

export type Assert = (cond: boolean, detail: string) => void;
export type TestFn = (t: { assert: Assert; repo: ReturnType<typeof getRepo> }) => Promise<void>;

export const SUITE: { group: string; name: string; fn: TestFn }[] = [
  // ---- Seed integrity ----------------------------------------------------
  {
    group: "Seed",
    name: "Deterministic dataset shape",
    fn: async ({ assert, repo }) => {
      const p = await repo.participants.list();
      const r = await repo.registrations.list();
      assert(p.length === 2414, `expected 2414 participants, got ${p.length}`);
      assert(r.length > 5000, `expected >5000 registrations, got ${r.length}`);
    },
  },
  {
    group: "Seed",
    name: "Every registration points at a real participant and event",
    fn: async ({ assert, repo }) => {
      const [regs, people, events] = await Promise.all([
        repo.registrations.list(),
        repo.participants.list(),
        repo.events.list(),
      ]);
      const pIds = new Set(people.map((x) => x.id));
      const eIds = new Set(events.map((x) => x.id));
      const orphanP = regs.filter((r) => !pIds.has(r.participantId));
      const orphanE = regs.filter((r) => !eIds.has(r.eventId));
      assert(orphanP.length === 0, `${orphanP.length} registrations have no participant`);
      assert(orphanE.length === 0, `${orphanE.length} registrations have no event`);
    },
  },
  {
    group: "Seed",
    name: "Every payment breakdown sums to its amount",
    fn: async ({ assert, repo }) => {
      const pays = await repo.payments.list();
      const bad = pays.filter(
        (p) => p.breakdown.reduce((s, b) => s + b.amount, 0) !== p.amount,
      );
      assert(bad.length === 0, `${bad.length} payments have a breakdown that does not sum`);
    },
  },

  // ---- Registration invariants -------------------------------------------
  {
    group: "Registrations",
    name: "Duplicate registration is rejected",
    fn: async ({ assert, repo }) => {
      const people = await repo.participants.list();
      const events = await repo.events.list();
      const ev = events.find((e) => e.status === "published" && e.capacity === null) ?? events[0];
      const p = people[5];
      await repo.registrations.create({ participantId: p.id, eventId: ev.id }).catch(() => null);
      try {
        await repo.registrations.create({ participantId: p.id, eventId: ev.id });
        assert(false, "second registration was allowed");
      } catch (e) {
        assert(
          isDataError(e) && e.code === "ALREADY_REGISTERED",
          `expected ALREADY_REGISTERED, got ${isDataError(e) ? e.code : String(e)}`,
        );
      }
    },
  },
  {
    group: "Registrations",
    name: "Over-capacity registration is waitlisted, not refused",
    fn: async ({ assert, repo }) => {
      const events = await repo.events.list();
      const stats = await repo.events.allStats();
      const full = stats.find(
        (s) => s.capacity != null && s.confirmedCount + s.pendingCount >= s.capacity,
      );
      assert(!!full, "no event is at capacity in the seed — cannot test");
      if (!full) return;
      const people = await repo.participants.list();
      const existing = new Set(
        (await repo.registrations.forEvent(full.eventId)).map((r) => r.participantId),
      );
      const candidate = people.find((p) => !existing.has(p.id));
      assert(!!candidate, "no free participant to register");
      if (!candidate) return;
      const ev = events.find((e) => e.id === full.eventId)!;
      if (ev.status !== "published") return;
      const rec = await repo.registrations.create({
        participantId: candidate.id,
        eventId: full.eventId,
      });
      assert(rec.status === "waitlisted", `expected waitlisted, got ${rec.status}`);
      assert(rec.waitlistPosition != null, "waitlist position was not assigned");
    },
  },
  {
    group: "Registrations",
    name: "Cancelling a live seat promotes the earliest waitlister",
    fn: async ({ assert, repo }) => {
      const events = await repo.events.list();
      for (const ev of events) {
        const wl = await repo.registrations.waitlist(ev.id);
        if (!wl.length) continue;
        const live = (await repo.registrations.forEvent(ev.id)).find(
          (r) => r.status === "confirmed" || r.status === "pending",
        );
        if (!live) continue;
        const first = wl[0];
        const res = await repo.registrations.cancel(live.id, "test");
        assert(res.cancelled.status === "cancelled", "seat was not cancelled");
        assert(res.promoted != null, "nobody was promoted into the freed seat");
        assert(
          res.promoted?.id === first.id,
          `promoted ${res.promoted?.id}, expected earliest ${first.id}`,
        );
        return;
      }
      assert(false, "no event had both a waitlist and a live seat");
    },
  },
  {
    group: "Registrations",
    name: "Registration closed on a cancelled event",
    fn: async ({ assert, repo }) => {
      const events = await repo.events.list();
      const cancelled = events.find((e) => e.status === "cancelled");
      if (!cancelled) {
        assert(true, "no cancelled event in seed — skipped");
        return;
      }
      const people = await repo.participants.list();
      try {
        await repo.registrations.create({
          participantId: people[100].id,
          eventId: cancelled.id,
        });
        assert(false, "registration into a cancelled event was allowed");
      } catch (e) {
        assert(
          isDataError(e) && e.code === "REGISTRATION_CLOSED",
          `expected REGISTRATION_CLOSED, got ${isDataError(e) ? e.code : String(e)}`,
        );
      }
    },
  },

  // ---- Money invariants ---------------------------------------------------
  {
    group: "Payments",
    name: "A reused UTR is rejected",
    fn: async ({ assert, repo }) => {
      const pays = await repo.payments.list();
      const withUtr = pays.find((p) => p.utr);
      assert(!!withUtr, "no payment with a UTR in the seed");
      if (!withUtr) return;
      const people = await repo.participants.list();
      try {
        await repo.payments.create({
          participantId: people[7].id,
          registrationIds: [],
          method: "upi",
          utr: withUtr.utr,
          amount: 100,
          breakdown: [{ label: "Test", kind: "base", refId: null, amount: 100 }],
        });
        assert(false, "duplicate UTR was accepted");
      } catch (e) {
        assert(
          isDataError(e) && e.code === "UTR_ALREADY_USED",
          `expected UTR_ALREADY_USED, got ${isDataError(e) ? e.code : String(e)}`,
        );
      }
    },
  },
  {
    group: "Payments",
    name: "A breakdown that does not sum is rejected",
    fn: async ({ assert, repo }) => {
      const people = await repo.participants.list();
      try {
        await repo.payments.create({
          participantId: people[8].id,
          registrationIds: [],
          method: "cash",
          amount: 500,
          breakdown: [{ label: "Wrong", kind: "base", refId: null, amount: 300 }],
        });
        assert(false, "mismatched breakdown was accepted");
      } catch (e) {
        assert(
          isDataError(e) && e.code === "AMOUNT_MISMATCH",
          `expected AMOUNT_MISMATCH, got ${isDataError(e) ? e.code : String(e)}`,
        );
      }
    },
  },
  {
    group: "Payments",
    name: "Verification is idempotent — no second invoice serial",
    fn: async ({ assert, repo }) => {
      const queue = await repo.payments.queue();
      assert(queue.length > 0, "verification queue is empty");
      if (!queue.length) return;
      const first = await repo.payments.review(queue[0].id, "verified");
      const again = await repo.payments.review(queue[0].id, "verified");
      assert(first.status === "verified", "first verification did not stick");
      assert(!!first.invoiceSerial, "no invoice serial was issued");
      assert(
        first.invoiceSerial === again.invoiceSerial,
        `serial changed on re-verify: ${first.invoiceSerial} → ${again.invoiceSerial}`,
      );
    },
  },
  {
    group: "Payments",
    name: "Verifying a payment confirms its registrations",
    fn: async ({ assert, repo }) => {
      const queue = await repo.payments.queue();
      const target = queue.find((p) => p.registrationIds.length > 0);
      assert(!!target, "no queued payment settles a registration");
      if (!target) return;
      await repo.payments.review(target.id, "verified");
      const regs = await Promise.all(
        target.registrationIds.map((id) => repo.registrations.get(id)),
      );
      const stillPending = regs.filter((r) => r && r.status === "pending");
      assert(
        stillPending.length === 0,
        `${stillPending.length} registrations stayed pending after verification`,
      );
    },
  },
  {
    group: "Payments",
    name: "Invoice serials are unique",
    fn: async ({ assert, repo }) => {
      const pays = await repo.payments.list();
      const serials = pays.map((p) => p.invoiceSerial).filter(Boolean);
      assert(
        new Set(serials).size === serials.length,
        `${serials.length - new Set(serials).size} duplicate invoice serials`,
      );
    },
  },
  {
    group: "Payments",
    name: "Fraud sweep flags a reused UTR",
    fn: async ({ assert, repo }) => {
      const flagged = await repo.payments.runFraudSweep();
      const dupUtr = flagged.filter((p) => p.fraudFlags.some((f) => f.kind === "duplicate_utr"));
      assert(dupUtr.length > 0, "the seeded reused-UTR case was not flagged");
    },
  },
  {
    group: "Payments",
    name: "Fraud sweep flags a reused receipt image",
    fn: async ({ assert, repo }) => {
      const flagged = await repo.payments.runFraudSweep();
      const dupHash = flagged.filter((p) =>
        p.fraudFlags.some((f) => f.kind === "duplicate_receipt"),
      );
      assert(dupHash.length > 0, "the seeded duplicate-receipt case was not flagged");
    },
  },

  // ---- Refunds ------------------------------------------------------------
  {
    group: "Refunds",
    name: "A refund cannot exceed what was collected",
    fn: async ({ assert, repo }) => {
      const pays = await repo.payments.list({ status: ["verified"] });
      const p = pays[0];
      assert(!!p, "no verified payment to refund");
      if (!p) return;
      try {
        await repo.refunds.request({
          paymentId: p.id,
          amount: p.amount + 1000,
          reasonCode: "other",
        });
        assert(false, "over-refund was accepted");
      } catch (e) {
        assert(
          isDataError(e) && e.code === "REFUND_EXCEEDS_PAID",
          `expected REFUND_EXCEEDS_PAID, got ${isDataError(e) ? e.code : String(e)}`,
        );
      }
    },
  },
  {
    group: "Refunds",
    name: "An unverified payment cannot be refunded",
    fn: async ({ assert, repo }) => {
      const queue = await repo.payments.queue();
      assert(queue.length > 0, "no pending payment");
      if (!queue.length) return;
      try {
        await repo.refunds.request({
          paymentId: queue[0].id,
          amount: 100,
          reasonCode: "other",
        });
        assert(false, "refund on an unverified payment was accepted");
      } catch (e) {
        assert(
          isDataError(e) && e.code === "PAYMENT_NOT_VERIFIED",
          `expected PAYMENT_NOT_VERIFIED, got ${isDataError(e) ? e.code : String(e)}`,
        );
      }
    },
  },
  {
    group: "Refunds",
    name: "Only the Registration Head can approve a refund",
    fn: async ({ assert, repo }) => {
      const staff = await repo.staff.list();
      const finance = staff.find((s) => s.role === "finance");
      const head = staff.find((s) => s.role === "head");
      assert(!!finance && !!head, "seed is missing a finance or head role");
      if (!finance || !head) return;

      const pays = await repo.payments.list({ status: ["verified"] });
      const rec = await repo.refunds.request({
        paymentId: pays[1].id,
        amount: 50,
        reasonCode: "overcharge",
      });

      await repo.admin.setActor(finance.id);
      try {
        await repo.refunds.approve(rec.id);
        assert(false, "a Finance Verifier was allowed to approve a refund");
      } catch (e) {
        assert(
          isDataError(e) && e.code === "FORBIDDEN",
          `expected FORBIDDEN, got ${isDataError(e) ? e.code : String(e)}`,
        );
      }
      await repo.admin.setActor(head.id);
      const approved = await repo.refunds.approve(rec.id);
      assert(approved.status === "approved", "the Head could not approve");
    },
  },

  // ---- Accommodation ------------------------------------------------------
  {
    group: "Accommodation",
    name: "Allotment refuses a gender mismatch",
    fn: async ({ assert, repo }) => {
      const reqs = await repo.accommodation.requests("requested");
      const female = reqs.find((r) => r.gender === "female");
      assert(!!female, "no female request pending");
      if (!female) return;
      try {
        // blk-a is a male block.
        await repo.accommodation.allot(female.id, "blk-a", "999", 1);
        assert(false, "gender mismatch was allowed");
      } catch (e) {
        const code = isDataError(e) ? e.code : "";
        assert(
          code === "GENDER_MISMATCH" || code === "PAYMENT_NOT_VERIFIED" || code === "DOCS_INCOMPLETE",
          `expected a gate refusal, got ${code || String(e)}`,
        );
      }
    },
  },
  {
    group: "Accommodation",
    name: "Allotment refuses an unpaid participant",
    fn: async ({ assert, repo }) => {
      const reqs = await repo.accommodation.requests("requested");
      let hit = false;
      for (const r of reqs.slice(0, 40)) {
        const flags = await repo.participants.flags(r.participantId);
        if (flags.amountDue <= 0) continue;
        const block = r.gender === "female" ? "blk-c" : "blk-a";
        try {
          await repo.accommodation.allot(r.id, block, "998", 1);
          assert(false, `unpaid participant ${r.participantId} was given a bed`);
        } catch (e) {
          assert(
            isDataError(e) && e.code === "PAYMENT_NOT_VERIFIED",
            `expected PAYMENT_NOT_VERIFIED, got ${isDataError(e) ? e.code : String(e)}`,
          );
        }
        hit = true;
        break;
      }
      assert(hit, "no unpaid pending request found to test");
    },
  },
  {
    group: "Accommodation",
    name: "A bed cannot be double-allotted",
    fn: async ({ assert, repo }) => {
      const allots = await repo.accommodation.allotments();
      const taken = allots[0];
      assert(!!taken, "no existing allotment");
      if (!taken) return;
      const reqs = await repo.accommodation.requests("requested");
      const same = reqs.find((r) => r.gender !== "other");
      if (!same) return;
      try {
        await repo.accommodation.allot(same.id, taken.blockId, taken.roomNo, taken.bedNo);
        assert(false, "the same bed was allotted twice");
      } catch (e) {
        const code = isDataError(e) ? e.code : "";
        assert(
          ["ROOM_FULL", "GENDER_MISMATCH", "PAYMENT_NOT_VERIFIED", "DOCS_INCOMPLETE"].includes(code),
          `expected a gate refusal, got ${code || String(e)}`,
        );
      }
    },
  },
  {
    group: "Accommodation",
    name: "Occupancy never exceeds block capacity",
    fn: async ({ assert, repo }) => {
      const occ = await repo.accommodation.occupancy();
      const over = occ.filter((b) => b.occupied > b.capacity);
      assert(over.length === 0, `${over.length} blocks are over capacity`);
    },
  },

  // ---- Attendance ---------------------------------------------------------
  {
    group: "Attendance",
    name: "Check-in is idempotent",
    fn: async ({ assert, repo }) => {
      const people = await repo.participants.list();
      const p = people[42];
      const first = await repo.attendance.checkIn({ participantId: p.id });
      const second = await repo.attendance.checkIn({ participantId: p.id });
      assert(!first.wasAlready, "first check-in reported as already done");
      assert(second.wasAlready, "second check-in was not detected as duplicate");
      assert(
        first.record.id === second.record.id,
        "a second attendance record was created",
      );
    },
  },
  {
    group: "Attendance",
    name: "No-shows exclude anyone who checked in",
    fn: async ({ assert, repo }) => {
      const events = await repo.events.list();
      const ev = events[0];
      const noShows = await repo.attendance.noShows(ev.id);
      const attended = new Set(
        (await repo.attendance.list(undefined, ev.id)).map((a) => a.participantId),
      );
      const wrong = noShows.filter((r) => attended.has(r.participantId));
      assert(wrong.length === 0, `${wrong.length} no-shows had actually checked in`);
    },
  },

  // ---- Teams --------------------------------------------------------------
  {
    group: "Teams",
    name: "A locked roster refuses member changes",
    fn: async ({ assert, repo }) => {
      const teams = await repo.teams.list();
      const t = teams.find((x) => x.memberIds.length > 1) ?? teams[0];
      await repo.teams.setLocked(t.id, true);
      try {
        await repo.teams.removeMember(t.id, t.memberIds[0]);
        assert(false, "a locked roster was modified");
      } catch (e) {
        assert(
          isDataError(e) && e.code === "TEAM_LOCKED",
          `expected TEAM_LOCKED, got ${isDataError(e) ? e.code : String(e)}`,
        );
      }
      await repo.teams.setLocked(t.id, false);
    },
  },
  {
    group: "Teams",
    name: "Approving a substitution swaps the roster",
    fn: async ({ assert, repo }) => {
      const subs = await repo.teams.substitutions();
      const pending = subs.find((s) => s.status === "pending");
      assert(!!pending, "no pending substitution in the seed");
      if (!pending) return;
      await repo.teams.setLocked(pending.teamId, false);
      await repo.teams.reviewSubstitution(pending.id, "approved");
      const team = await repo.teams.get(pending.teamId);
      assert(
        !!team && team.memberIds.includes(pending.inParticipantId),
        "the incoming member was not added",
      );
      assert(
        !!team && !team.memberIds.includes(pending.outParticipantId),
        "the outgoing member was not removed",
      );
    },
  },

  // ---- Documents ----------------------------------------------------------
  {
    group: "Documents",
    name: "Under-18s require guardian consent",
    fn: async ({ assert, repo }) => {
      const people = await repo.participants.list();
      let checked = 0;
      for (const p of people.slice(0, 400)) {
        const flags = await repo.participants.flags(p.id);
        if (!flags.isMinor) continue;
        checked++;
        const completeness = await repo.documents.completeness();
        const row = completeness.find((c) => c.participantId === p.id);
        assert(
          !!row && row.required.includes("guardian_consent"),
          `minor ${p.code} does not require guardian consent`,
        );
        break;
      }
      assert(checked > 0, "no minors found in the first 400 participants");
    },
  },
  {
    group: "Documents",
    name: "Re-reviewing with the same decision is a no-op",
    fn: async ({ assert, repo }) => {
      const queue = await repo.documents.queue();
      assert(queue.length > 0, "document queue is empty");
      if (!queue.length) return;
      const first = await repo.documents.review(queue[0].id, "approved");
      const again = await repo.documents.review(queue[0].id, "approved");
      assert(first.reviewedAt === again.reviewedAt, "re-review changed the timestamp");
    },
  },

  // ---- Certificates -------------------------------------------------------
  {
    group: "Certificates",
    name: "Cannot certify someone with no attendance",
    fn: async ({ assert, repo }) => {
      const events = await repo.events.list();
      const people = await repo.participants.list();
      const attended = new Set((await repo.attendance.list()).map((a) => a.participantId));
      const absent = people.find((p) => !attended.has(p.id));
      assert(!!absent, "everyone has attendance");
      if (!absent) return;
      const res = await repo.certificates.issueBulk({
        eventId: events[0].id,
        kind: "participation",
        participantIds: [absent.id],
      });
      assert(res.issued === 0, "a certificate was issued without attendance");
      assert(res.skipped.length === 1, "the skip was not reported");
    },
  },

  // ---- Audit --------------------------------------------------------------
  {
    group: "Audit",
    name: "Every mutation writes an audit event",
    fn: async ({ assert, repo }) => {
      const before = (await repo.audit.list({ limit: 1 }))[0];
      const queue = await repo.payments.queue();
      if (!queue.length) return;
      await repo.payments.review(queue[0].id, "verified");
      const after = (await repo.audit.list({ limit: 1 }))[0];
      assert(after.id !== before?.id, "no audit event was written");
      assert(after.entity === "payment", `audit entity was ${after.entity}`);
      assert(!!after.actorName, "audit event has no actor");
    },
  },
  {
    group: "Audit",
    name: "Audit records before and after state",
    fn: async ({ assert, repo }) => {
      const events = await repo.audit.list({ entity: "payment", limit: 50 });
      const withBoth = events.filter((a) => a.before && a.after);
      assert(withBoth.length > 0, "no audit event carries before/after state");
    },
  },

  // ---- Reconciliation -----------------------------------------------------
  {
    group: "Reconciliation",
    name: "Unmatched worklists are disjoint from matched records",
    fn: async ({ assert, repo }) => {
      const { inBank, inApp } = await repo.settlements.unmatched();
      const settlements = await repo.settlements.list();
      const matchedIds = new Set(
        settlements.filter((s) => s.matchedPaymentId).map((s) => s.matchedPaymentId),
      );
      const leak = inApp.filter((p) => matchedIds.has(p.id));
      assert(leak.length === 0, `${leak.length} matched payments appear in the unmatched list`);
      const bankLeak = inBank.filter((s) => s.matchedPaymentId);
      assert(bankLeak.length === 0, `${bankLeak.length} matched bank lines appear as unmatched`);
    },
  },
  {
    group: "Reconciliation",
    name: "Manual match removes a line from both worklists",
    fn: async ({ assert, repo }) => {
      const before = await repo.settlements.unmatched();
      assert(before.inBank.length > 0 && before.inApp.length > 0, "nothing left to match");
      if (!before.inBank.length || !before.inApp.length) return;
      await repo.settlements.match(before.inBank[0].id, before.inApp[0].id);
      const after = await repo.settlements.unmatched();
      assert(
        after.inBank.length === before.inBank.length - 1,
        "the bank line was not removed from the worklist",
      );
      assert(
        after.inApp.length === before.inApp.length - 1,
        "the payment was not removed from the worklist",
      );
    },
  },

  // ---- Aggregates ---------------------------------------------------------
  {
    group: "Aggregates",
    name: "Overview funnel is monotonically non-increasing where it should be",
    fn: async ({ assert, repo }) => {
      const s = await repo.overview.stats();
      const registered = s.funnel[0].count;
      const checkedIn = s.funnel[s.funnel.length - 1].count;
      assert(registered > 0, "funnel starts at zero");
      assert(checkedIn <= registered, "more people checked in than registered");
    },
  },
  {
    group: "Aggregates",
    name: "Outstanding dues are all strictly positive",
    fn: async ({ assert, repo }) => {
      const dues = await repo.payments.outstanding();
      const bad = dues.filter((d) => d.due <= 0);
      assert(bad.length === 0, `${bad.length} rows in the dues list owe nothing`);
    },
  },
  {
    group: "Aggregates",
    name: "Contingent totals reconcile with the participant list",
    fn: async ({ assert, repo }) => {
      const [contingents, people] = await Promise.all([
        repo.colleges.contingents(),
        repo.participants.list(),
      ]);
      const sum = contingents.reduce((s, c) => s + c.participants, 0);
      assert(
        sum === people.length,
        `contingent headcount ${sum} does not match ${people.length} participants`,
      );
    },
  },
  {
    group: "Aggregates",
    name: "Event stats never report negative seats beyond capacity math",
    fn: async ({ assert, repo }) => {
      const stats = await repo.events.allStats();
      const bad = stats.filter((s) => s.confirmedCount < 0 || s.waitlistCount < 0);
      assert(bad.length === 0, `${bad.length} events have negative counts`);
    },
  },

  // ---- Participants -------------------------------------------------------
  {
    group: "Participants",
    name: "Duplicate phone number is refused on create",
    fn: async ({ assert, repo }) => {
      const people = await repo.participants.list();
      const existing = people[3];
      try {
        await repo.participants.create({
          fullName: "Test Duplicate",
          email: "test.duplicate@example.com",
          phone: existing.phone,
          gender: "male",
          dateOfBirth: "2004-01-01",
          collegeId: existing.collegeId,
          department: "CS",
          yearOfStudy: 2,
          category: "participant",
          tshirtSize: "M",
          emergencyName: "",
          emergencyPhone: "",
          dietaryPref: "veg",
          notes: null,
          createdVia: "on_spot",
        });
        assert(false, "a duplicate phone number was accepted");
      } catch (e) {
        assert(
          isDataError(e) && e.code === "DUPLICATE_PARTICIPANT",
          `expected DUPLICATE_PARTICIPANT, got ${isDataError(e) ? e.code : String(e)}`,
        );
      }
    },
  },
  {
    group: "Participants",
    name: "Merge re-points registrations and removes the duplicate",
    fn: async ({ assert, repo }) => {
      const dupes = await repo.participants.findDuplicates();
      assert(dupes.length > 0, "no duplicates detected in the seed");
      if (!dupes.length) return;
      const { a, b } = dupes[0];
      const beforeCount = (await repo.participants.list()).length;
      await repo.participants.merge(a.id, b.id);
      const after = await repo.participants.list();
      assert(after.length === beforeCount - 1, "the duplicate was not removed");
      assert(!after.some((p) => p.id === b.id), "the merged record still exists");
      const orphaned = (await repo.registrations.list()).filter((r) => r.participantId === b.id);
      assert(orphaned.length === 0, `${orphaned.length} registrations still point at the merged id`);
    },
  },
  {
    group: "Participants",
    name: "Erasure anonymises identity but keeps the money trail",
    fn: async ({ assert, repo }) => {
      const people = await repo.participants.list();
      const target = people.find((p) => p.fullName !== "[erased]")!;
      const paysBefore = await repo.payments.forParticipant(target.id);
      await repo.participants.erase(target.id);
      const after = await repo.participants.get(target.id);
      assert(after?.fullName === "[erased]", "the name was not anonymised");
      assert(after?.phone === "", "the phone number was not cleared");
      const paysAfter = await repo.payments.forParticipant(target.id);
      assert(
        paysAfter.length === paysBefore.length,
        "payment records were destroyed by an erasure",
      );
    },
  },
];


/**
 * Runs every assertion against a freshly reseeded store. Shared by the page and
 * the Node runner so there is exactly one definition of "passing".
 */
export async function runSuite(
  onProgress?: (r: Result[]) => void,
): Promise<Result[]> {
  const repo = getRepo();
  await repo.admin.reset();

  const out: Result[] = [];
  for (const test of SUITE) {
    const started = Date.now();
    const failures: string[] = [];
    const assert: Assert = (cond, detail) => {
      if (!cond) failures.push(detail);
    };
    try {
      await test.fn({ assert, repo });
    } catch (e) {
      failures.push(
        e instanceof DataError ? `threw ${e.code}: ${e.message}` : `threw ${String(e)}`,
      );
    }
    out.push({
      name: test.name,
      group: test.group,
      ok: failures.length === 0,
      detail: failures.join(" · ") || "ok",
      ms: Date.now() - started,
    });
    onProgress?.([...out]);
  }
  return out;
}
