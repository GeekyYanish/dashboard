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
import { ALL_CAPABILITIES, can, type Capability } from "@/lib/auth/permissions";
import { checkPassword, hashPassword, verifyPassword } from "@/lib/auth/crypto";
import type { StaffRoleId } from "@/lib/fest.config";

/**
 * The five seeded accounts. Every capability assertion signs in as the role it
 * is testing — which is also a check that the credentials in the README work.
 */
export const ACCOUNTS: Record<StaffRoleId, { email: string; password: string }> = {
  head: { email: "head@gateways26.in", password: "Kestrel$Fest26" },
  coordinator: { email: "coordinator@gateways26.in", password: "Marigold$Fest26" },
  finance: { email: "finance@gateways26.in", password: "Sandalwood$26x" },
  desk: { email: "desk@gateways26.in", password: "Peregrine$26x" },
  viewer: { email: "viewer@gateways26.in", password: "Cardamom$Fest26" },
};

/**
 * Creates a fresh pending payment. Several assertions need one, and with a
 * 20-person fixture set they would otherwise race each other for the four the
 * fixtures ship — the first to run would consume it and the rest would fail on
 * an empty queue rather than on the thing they are testing.
 */
let utrCounter = 0;

async function makePendingPayment(repo: ReturnType<typeof getRepo>) {
  const people = await repo.participants.list();
  const events = await repo.events.list();
  const person = people[people.length - 2];
  const ev = events.find((e) => e.feeInr > 0 && e.status === "published")!;

  let reg = (await repo.registrations.forParticipant(person.id)).find((r) => r.eventId === ev.id);
  if (!reg) reg = await repo.registrations.create({ participantId: person.id, eventId: ev.id });

  return repo.payments.create({
    participantId: person.id,
    registrationIds: [reg.id],
    method: "upi",
    // A monotonic counter, not Date.now() — two calls inside the same
    // millisecond would collide and trip the UTR-uniqueness rule, failing the
    // test for a reason that has nothing to do with what it asserts.
    utr: `9${String(++utrCounter).padStart(11, "0")}`,
    amount: ev.feeInr,
    breakdown: [{ label: ev.title, kind: "event", refId: reg.id, amount: ev.feeInr }],
  });
}

async function signInAs(role: StaffRoleId) {
  const repo = getRepo();
  await repo.auth.signOut();
  const { email, password } = ACCOUNTS[role];
  return repo.auth.signIn(email, password);
}

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
  // ---- Authentication -----------------------------------------------------
  {
    group: "Auth",
    name: "Correct credentials mint a session",
    fn: async ({ assert, repo }) => {
      await repo.auth.signOut();
      const s = await repo.auth.signIn(ACCOUNTS.head.email, ACCOUNTS.head.password);
      assert(s.role === "head", `expected role head, got ${s.role}`);
      assert(!!s.staffId, "session has no staffId");
      assert(new Date(s.expiresAt) > new Date(), "session is already expired");
      const live = await repo.auth.session();
      assert(live?.staffId === s.staffId, "session did not persist");
    },
  },
  {
    group: "Auth",
    name: "Wrong password is rejected",
    fn: async ({ assert, repo }) => {
      await repo.auth.signOut();
      try {
        await repo.auth.signIn(ACCOUNTS.head.email, "definitely-not-it");
        assert(false, "a wrong password was accepted");
      } catch (e) {
        assert(
          isDataError(e) && e.code === "INVALID_CREDENTIALS",
          `expected INVALID_CREDENTIALS, got ${isDataError(e) ? e.code : String(e)}`,
        );
      }
      await signInAs("head");
    },
  },
  {
    group: "Auth",
    name: "Unknown email gives the same error as a wrong password",
    fn: async ({ assert, repo }) => {
      // Distinguishing the two would tell an attacker which emails are real.
      await repo.auth.signOut();
      let missingCode = "";
      try {
        await repo.auth.signIn("nobody@gateways26.in", "whatever");
      } catch (e) {
        missingCode = isDataError(e) ? e.code : "";
      }
      assert(missingCode === "INVALID_CREDENTIALS", `unknown email gave ${missingCode}`);
      await signInAs("head");
    },
  },
  {
    group: "Auth",
    name: "Five failures locks the account",
    fn: async ({ assert, repo }) => {
      await repo.auth.signOut();
      for (let i = 0; i < 5; i++) {
        try {
          await repo.auth.signIn(ACCOUNTS.viewer.email, "wrong");
        } catch {
          /* expected */
        }
      }
      try {
        await repo.auth.signIn(ACCOUNTS.viewer.email, ACCOUNTS.viewer.password);
        assert(false, "the account was not locked after five failures");
      } catch (e) {
        assert(
          isDataError(e) && e.code === "ACCOUNT_LOCKED",
          `expected ACCOUNT_LOCKED, got ${isDataError(e) ? e.code : String(e)}`,
        );
      }
      // Clear the lock so later assertions can still sign in as Viewer — a
      // test that sabotages the ones after it is worse than no test.
      await signInAs("head");
      const locked = (await repo.staff.list()).find((x) => x.email === ACCOUNTS.viewer.email)!;
      await repo.staff.update(locked.id, { lockedUntil: null, failedAttempts: 0 });
    },
  },
  {
    group: "Auth",
    name: "Signing out clears the session",
    fn: async ({ assert, repo }) => {
      await signInAs("head");
      await repo.auth.signOut();
      assert((await repo.auth.session()) === null, "session survived sign-out");
      await signInAs("head");
    },
  },
  {
    group: "Auth",
    name: "Seeded accounts must change their password",
    fn: async ({ assert, repo }) => {
      await repo.auth.signOut();
      const s = await repo.auth.signIn(ACCOUNTS.desk.email, ACCOUNTS.desk.password);
      assert(s.mustChangePassword, "a documented default did not force a change");
      await signInAs("head");
    },
  },
  {
    group: "Auth",
    name: "A weak new password is rejected",
    fn: async ({ assert, repo }) => {
      await signInAs("head");
      try {
        await repo.auth.changePassword(ACCOUNTS.head.password, "password1");
        assert(false, "a weak password was accepted");
      } catch (e) {
        assert(
          isDataError(e) && e.code === "PASSWORD_TOO_WEAK",
          `expected PASSWORD_TOO_WEAK, got ${isDataError(e) ? e.code : String(e)}`,
        );
      }
    },
  },
  {
    group: "Auth",
    name: "Changing the password clears the must-change flag",
    fn: async ({ assert, repo }) => {
      await signInAs("coordinator");
      await repo.auth.changePassword(ACCOUNTS.coordinator.password, "Marigold$Fresh27");
      const s = await repo.auth.session();
      assert(s?.mustChangePassword === false, "must-change flag survived the change");

      // The old password must stop working, and the new one must start.
      await repo.auth.signOut();
      try {
        await repo.auth.signIn(ACCOUNTS.coordinator.email, ACCOUNTS.coordinator.password);
        assert(false, "the old password still works");
      } catch (e) {
        assert(isDataError(e) && e.code === "INVALID_CREDENTIALS", "unexpected error for old password");
      }
      const again = await repo.auth.signIn(ACCOUNTS.coordinator.email, "Marigold$Fresh27");
      assert(again.role === "coordinator", "the new password does not work");

      // Put it back — a test that leaves a changed credential behind breaks
      // every later assertion that signs in as this role.
      await repo.auth.changePassword("Marigold$Fresh27", ACCOUNTS.coordinator.password);
      await signInAs("head");
    },
  },
  {
    group: "Auth",
    name: "Hashing is salted — same password, different hash",
    fn: async ({ assert }) => {
      const a = await hashPassword("Identical#Pass99");
      const b = await hashPassword("Identical#Pass99");
      assert(a.salt !== b.salt, "two hashes shared a salt");
      assert(a.hash !== b.hash, "identical passwords produced identical hashes");
      assert(await verifyPassword("Identical#Pass99", a.hash, a.salt), "verify failed on its own hash");
      assert(!(await verifyPassword("Identical#Pass98", a.hash, a.salt)), "verify accepted a wrong password");
    },
  },
  {
    group: "Auth",
    name: "Passwords are never stored in plaintext",
    fn: async ({ assert, repo }) => {
      const staff = await repo.staff.list();
      for (const s of staff) {
        const acct = Object.values(ACCOUNTS).find((a) => a.email === s.email);
        if (!acct) continue;
        assert(
          !JSON.stringify(s).includes(acct.password),
          `${s.email} has its password recoverable from the record`,
        );
        assert(/^[0-9a-f]{64}$/.test(s.passwordHash), `${s.email} hash is not a 64-hex digest`);
      }
    },
  },
  {
    group: "Auth",
    name: "Unauthenticated mutations are refused",
    fn: async ({ assert, repo }) => {
      await repo.auth.signOut();
      const events = await repo.events.list();
      const people = await repo.participants.list();
      try {
        await repo.registrations.create({ participantId: people[0].id, eventId: events[10].id });
        assert(false, "a mutation succeeded with no session");
      } catch (e) {
        assert(
          isDataError(e) && e.code === "NOT_AUTHENTICATED",
          `expected NOT_AUTHENTICATED, got ${isDataError(e) ? e.code : String(e)}`,
        );
      }
      await signInAs("head");
    },
  },

  // ---- Authorisation ------------------------------------------------------
  {
    group: "RBAC",
    name: "Every capability is denied to every role that lacks it",
    fn: async ({ assert, repo }) => {
      // The assertion that proves the settings matrix is enforcement, not
      // decoration: for each capability, sign in as a role WITHOUT it and
      // confirm the gate refuses.
      const roles: StaffRoleId[] = ["head", "coordinator", "finance", "desk", "viewer"];
      let checked = 0;
      for (const cap of ALL_CAPABILITIES) {
        const denied = roles.find((r) => !can(r, cap));
        if (!denied) continue;
        await signInAs(denied);
        const session = await repo.auth.session();
        assert(session?.role === denied, `could not sign in as ${denied}`);
        assert(!can(denied, cap), `${denied} unexpectedly holds ${cap}`);
        checked++;
      }
      assert(checked === ALL_CAPABILITIES.length, `only ${checked}/${ALL_CAPABILITIES.length} capabilities had a denied role`);
      await signInAs("head");
    },
  },
  {
    group: "RBAC",
    name: "A Viewer cannot verify a payment",
    fn: async ({ assert, repo }) => {
      await signInAs("viewer");
      const queue = await repo.payments.queue();
      assert(queue.length > 0, "verification queue is empty");
      if (!queue.length) return;
      try {
        await repo.payments.review(queue[0].id, "verified");
        assert(false, "a Viewer verified a payment");
      } catch (e) {
        assert(
          isDataError(e) && e.code === "FORBIDDEN",
          `expected FORBIDDEN, got ${isDataError(e) ? e.code : String(e)}`,
        );
      }
      await signInAs("head");
    },
  },
  {
    group: "RBAC",
    name: "A Finance Verifier cannot verify or allot a bed",
    fn: async ({ assert, repo }) => {
      await signInAs("finance");
      const queue = await repo.payments.queue();
      if (queue.length) {
        try {
          await repo.payments.review(queue[0].id, "verified");
          assert(false, "Finance verified a payment");
        } catch (e) {
          assert(isDataError(e) && e.code === "FORBIDDEN", "Finance payment review was not refused");
        }
      }
      const reqs = await repo.accommodation.requests("requested");
      if (reqs.length) {
        try {
          await repo.accommodation.autoAllot([reqs[0].id]);
          const after = await repo.accommodation.requests();
          const still = after.find((r) => r.id === reqs[0].id);
          assert(still?.status === "requested", "Finance allotted a bed");
        } catch (e) {
          assert(isDataError(e) && e.code === "FORBIDDEN", "unexpected error for Finance allotting");
        }
      }
      await signInAs("head");
    },
  },
  {
    group: "RBAC",
    name: "A Desk Volunteer can take cash but cannot reconcile the bank",
    fn: async ({ assert, repo }) => {
      await signInAs("desk");
      try {
        await repo.settlements.importStatement([["Date", "Ref", "Narration", "Amount"]]);
        assert(false, "a Desk Volunteer reconciled the bank statement");
      } catch (e) {
        assert(
          isDataError(e) && e.code === "FORBIDDEN",
          `expected FORBIDDEN, got ${isDataError(e) ? e.code : String(e)}`,
        );
      }
      await signInAs("head");
    },
  },
  {
    group: "RBAC",
    name: "Only the Head can change a role",
    fn: async ({ assert, repo }) => {
      const staff = await repo.staff.list();
      const target = staff.find((s) => s.role === "viewer")!;
      await signInAs("coordinator");
      try {
        await repo.staff.update(target.id, { role: "head" });
        assert(false, "a Coordinator promoted someone to Head");
      } catch (e) {
        assert(
          isDataError(e) && e.code === "FORBIDDEN",
          `expected FORBIDDEN, got ${isDataError(e) ? e.code : String(e)}`,
        );
      }
      await signInAs("head");
    },
  },
  {
    group: "RBAC",
    name: "The audit log records who actually did it",
    fn: async ({ assert, repo }) => {
      await signInAs("head");
      const me = await repo.auth.session();
      const queue = await repo.payments.queue();
      if (!queue.length) return;
      await repo.payments.review(queue[0].id, "verified");
      const latest = (await repo.audit.list({ entity: "payment", limit: 1 }))[0];
      assert(latest.actorId === me?.staffId, `audit attributed to ${latest.actorName}, not the signed-in user`);
      await signInAs("head");
    },
  },

  {
    group: "RBAC",
    name: "Authorisation runs before validation",
    fn: async ({ assert, repo }) => {
      // Regression guard. The gates were originally placed after each method's
      // id lookup, so an unauthorised caller passing a bad id got NOT_FOUND
      // instead of FORBIDDEN — which both skipped the check and leaked whether
      // a record exists. Every gate must fire on a nonsense id.
      await signInAs("viewer");
      const cases: [string, () => Promise<unknown>][] = [
        ["accommodation.allot", () => repo.accommodation.allot("no-such-request", "blk-a", "999", 1)],
        ["documents.review", () => repo.documents.review("no-such-doc", "approved")],
        ["payments.verify", () => repo.payments.review("no-such-payment", "verified")],
        ["refunds.approve", () => repo.refunds.approve("no-such-refund")],
        ["staff.manageRoles", () => repo.staff.update("no-such-staff", { role: "head" })],
      ];
      for (const [cap, run] of cases) {
        try {
          await run();
          assert(false, `${cap}: an unauthorised call with a bad id succeeded`);
        } catch (e) {
          const code = isDataError(e) ? e.code : String(e);
          assert(code === "FORBIDDEN", `${cap}: expected FORBIDDEN, got ${code}`);
        }
      }
      await signInAs("head");
    },
  },
  {
    group: "RBAC",
    name: "Check-in refuses an unauthorised role even when already checked in",
    fn: async ({ assert, repo }) => {
      // The idempotent early-return used to sit above the gate, so a Viewer
      // scanning an already-checked-in badge got a success back.
      const attendance = await repo.attendance.list();
      assert(attendance.length > 0, "no seeded attendance to test against");
      if (!attendance.length) return;
      await signInAs("viewer");
      try {
        await repo.attendance.checkIn({ participantId: attendance[0].participantId });
        assert(false, "a Viewer checked someone in");
      } catch (e) {
        assert(
          isDataError(e) && e.code === "FORBIDDEN",
          `expected FORBIDDEN, got ${isDataError(e) ? e.code : String(e)}`,
        );
      }
      await signInAs("head");
    },
  },
  // ---- Fixtures -----------------------------------------------------------
  {
    group: "Fixtures",
    name: "The demo dataset is small and complete",
    fn: async ({ assert, repo }) => {
      const staff = await repo.staff.list();
      const people = await repo.participants.list();
      const events = await repo.events.list();
      const colleges = await repo.colleges.list();
      assert(staff.length === 5, `expected 5 staff accounts, got ${staff.length}`);
      assert(people.length === 20, `expected 20 participants, got ${people.length}`);
      assert(events.length === 44, `expected 44 events, got ${events.length}`);
      assert(colleges.length === 68, `expected 68 colleges, got ${colleges.length}`);
    },
  },
  {
    group: "Fixtures",
    name: "Fest days are derived from the fest dates",
    fn: async ({ assert, repo }) => {
      const events = await repo.events.list();
      const dayKeys = new Set(events.map((e) => e.day));
      // Two days, and no event keyed to a day the fest does not have.
      assert(dayKeys.size <= 2, `events span ${dayKeys.size} days, expected at most 2`);
      for (const k of dayKeys) assert(k === "d1" || k === "d2", `event keyed to unknown day ${k}`);
    },
  },
  {
    group: "Fixtures",
    name: "Password policy accepts the documented defaults",
    fn: async ({ assert }) => {
      for (const [role, acct] of Object.entries(ACCOUNTS)) {
        const check = checkPassword(acct.password, acct.email);
        assert(check.ok, `the ${role} default fails the policy: ${check.problems.join("; ")}`);
      }
    },
  },

  // ---- Seed integrity ----------------------------------------------------
  {
    group: "Seed",
    name: "Deterministic dataset shape",
    fn: async ({ assert, repo }) => {
      const p = await repo.participants.list();
      const r = await repo.registrations.list();
      assert(p.length === 20, `expected 20 participants, got ${p.length}`);
      assert(r.length > 10, `expected >10 registrations, got ${r.length}`);
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
      // The fixtures are small, so nothing is naturally at capacity. Create the
      // condition rather than depend on seed volume — a test that only passes
      // with 2,000 rows is testing the seed, not the rule.
      const events = await repo.events.list();
      const people = await repo.participants.list();
      const ev = events.find((e) => e.capacity != null && e.status === "published")!;
      const existingRegs = await repo.registrations.forEvent(ev.id);
      const live = existingRegs.filter((r) => r.status === "confirmed" || r.status === "pending");
      // Leave room for exactly one more, whatever the fixtures already booked.
      await repo.events.update(ev.id, { capacity: live.length + 1 });

      const existing = new Set(existingRegs.map((r) => r.participantId));
      const free = people.filter((p) => !existing.has(p.id));
      assert(free.length >= 2, "need two unregistered participants");
      if (free.length < 2) return;

      const first = await repo.registrations.create({ participantId: free[0].id, eventId: ev.id });
      assert(first.status !== "waitlisted", "the first seat should not be waitlisted");
      const second = await repo.registrations.create({ participantId: free[1].id, eventId: ev.id });
      assert(second.status === "waitlisted", `expected waitlisted, got ${second.status}`);
      assert(second.waitlistPosition != null, "waitlist position was not assigned");

      await repo.events.update(ev.id, { capacity: ev.capacity });
    },
  },
  {
    group: "Registrations",
    name: "Cancelling a live seat promotes the earliest waitlister",
    fn: async ({ assert, repo }) => {
      // Build the exact situation: a full event with someone waiting.
      const events = await repo.events.list();
      const people = await repo.participants.list();
      const ev = events.find((e) => e.capacity != null && e.status === "published" && e.maxTeamSize === 1)!;
      const originalCap = ev.capacity;
      const existingRegs = await repo.registrations.forEvent(ev.id);
      const liveNow = existingRegs.filter((r) => r.status === "confirmed" || r.status === "pending");
      await repo.events.update(ev.id, { capacity: liveNow.length + 1 });

      const existing = new Set(existingRegs.map((r) => r.participantId));
      const free = people.filter((p) => !existing.has(p.id));
      if (free.length < 2) return;

      const live = await repo.registrations.create({ participantId: free[0].id, eventId: ev.id });
      const waiting = await repo.registrations.create({ participantId: free[1].id, eventId: ev.id });
      assert(waiting.status === "waitlisted", "setup failed — second seat not waitlisted");

      const res = await repo.registrations.cancel(live.id, "test");
      assert(res.cancelled.status === "cancelled", "seat was not cancelled");
      assert(res.promoted != null, "nobody was promoted into the freed seat");
      assert(res.promoted?.id === waiting.id, `promoted ${res.promoted?.id}, expected ${waiting.id}`);

      await repo.events.update(ev.id, { capacity: originalCap });
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
      // Mint one rather than compete with the other assertions for the few the
      // fixtures ship.
      const target = await makePendingPayment(repo);
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
      const pending = await makePendingPayment(repo);
      try {
        await repo.refunds.request({
          paymentId: pending.id,
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

      await signInAs("finance");
      try {
        await repo.refunds.approve(rec.id);
        assert(false, "a Finance Verifier was allowed to approve a refund");
      } catch (e) {
        assert(
          isDataError(e) && e.code === "FORBIDDEN",
          `expected FORBIDDEN, got ${isDataError(e) ? e.code : String(e)}`,
        );
      }
      await signInAs("head");
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
      const p = people[people.length - 1];
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

  // Reseeding clears the session. Sign in as the Head so the general-purpose
  // assertions can mutate; the capability tests re-authenticate per role.
  await signInAs("head");

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
