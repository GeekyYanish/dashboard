# Validation matrix — Registration Console (Gateways '26)

A manual test pass covering every screen, form, guard and permission in the console,
written from the source. Run it end to end before the fest; run sections **A** and **P**
after any change to auth or the permission map.

**Who is who.** There is no participant login — participants are *data*, not users. All
five sign-in accounts are staff. Throughout this document:

- **Admin** = **Registration Head** (`head@gateways26.in`) — the only role that can approve
  refunds, change staff roles and erase personal data.
- **End user** = the four operator roles — **Coordinator**, **Finance Verifier**,
  **Desk Volunteer**, **Viewer**.

Case IDs are stable. Cite them in bug reports.

| Prefix | Section |
|---|---|
| `A-` | Auth & session |
| `P-` | Permissions (admin vs operator) |
| `R-` | Registrations & CSV import |
| `$-` | Payments & finance |
| `L-` | Logistics — documents, accommodation, travel |
| `D-` | Desk kiosk |
| `E-` | Engage — comms, certificates, helpdesk |
| `O-` | Operate — reports, team, audit, settings, war room |
| `X-` | Cross-cutting — tables, filters, a11y, responsive, storage |

---

## 0. Before you start

### Running it

```bash
npm run dev
```

The app has **no backend**. Every record is generated in the browser from a deterministic
seed (`20260212`) and mutations are replayed from a `localStorage` overlay. That means the
whole matrix is reproducible, and a reset returns you to a known state.

### State lives in these `localStorage` keys

| Key | Holds |
|---|---|
| `gateways.session.v1` | The signed-in session (12h TTL) |
| `aurora.overlay.v1` | Every mutation you make |
| `aurora.seed.v1` | The seed number |
| `aurora.prefs` | Theme, row density, reduce-motion |
| `aurora.desk.queue.v1` | Desk writes queued while offline |

### Resetting between passes

Any of these three, in order of convenience:

1. **Settings → Data privacy → Reset all data** (confirm modal).
2. The **Reset** button in the login screen's *Demo accounts* panel — calls
   `admin.reset()` and reloads after 600ms.
3. DevTools → Application → clear the five keys above → reload.

Reset restores the **default passwords**, so re-run it before any `A-` case that changes one.

### Accounts

| Role | Email | Password | Name |
|---|---|---|---|
| Registration Head (**admin**) | `head@gateways26.in` | `Kestrel$Fest26` | Rhea Kamath |
| Coordinator | `coordinator@gateways26.in` | `Marigold$Fest26` | Aniket Deshpande |
| Finance Verifier | `finance@gateways26.in` | `Sandalwood$26x` | Vikram Shetty |
| Desk Volunteer | `desk@gateways26.in` | `Peregrine$26x` | Karan Bhat |
| Viewer | `viewer@gateways26.in` | `Cardamom$Fest26` | Joseph Kurian |

All five ship with `mustChangePassword: true`, so **every first sign-in lands on
`/login/set-password`**, not the dashboard. That is expected, not a bug.

### Fixture landmarks you will need

The seed ships **20 people**. Several are deliberately shaped for specific cases:

| Person | Why it matters |
|---|---|
| **Aditya Sharma** (NITK) + **ADITYA SHARMA** | Same phone, uppercase name, different inbox — the duplicate worklist's target |
| **Ananya Iyer** (17) and **Nikhil Gupta** (17) | Under 18 on the fest start date ⇒ `guardian_consent` is force-added to required docs |
| **Rohan Deshpande**, **Nikhil Gupta** | `unpaid` — outstanding dues, allotment should refuse |
| **Kavya Hegde** | `partial` payment |
| **Priya Chatterjee** | `rejected` payment |
| **Karthik Reddy**, **Faizan Ahmed**, **Harsh Patel** | `pending` payment — the verification queue |
| **Suresh Nair** | Faculty escort, ₹0 fee, needs `institution_letter` |

Fest dates: **8–9 Oct 2026** (days `d1`, `d2`). Registration closes **6 Oct 2026**.
Early bird ended **5 Jan 2026**.

### Case format

```
### A-01 — short title
Role · Screen · Precondition
Steps → Expect
```

Tick `[ ]` when it passes. If the observed result differs from *Expect*, check
[section 10](#10-known-defects) before filing — several of these are known.

---

## 1. Auth & session (`A-`)

### Sign-in

- [ ] **A-01 — Happy sign-in, each role.** `/login` · Sign in with each of the five
  credentials above. → Lands on `/login/set-password` (first run) or `/` Command Center.
  Topbar avatar shows the correct name and role label.
- [ ] **A-02 — Wrong password.** → Inline `role="alert"` block reads
  **"Email or password is incorrect"**. Password field is not cleared silently without a
  message; no redirect.
- [ ] **A-03 — Unknown email returns the *same* message.** Sign in as
  `nobody@gateways26.in` / anything. → **Identical** text to A-02. This is deliberate — a
  different message would tell an attacker which addresses are real. Any divergence is a
  security regression.
- [ ] **A-04 — Email is trimmed and case-insensitive.** `  HEAD@GATEWAYS26.IN  ` with the
  correct password. → Signs in.
- [ ] **A-05 — Submit disabled until both fields are non-empty.** → Button is disabled with
  either field blank.
- [ ] **A-06 — Browser-native email validation.** Type `notanemail` and submit. → The
  `type="email"` field blocks submission.
- [ ] **A-07 — Disabled account.** Set a staff member's `isActive` to false (Team screen or
  overlay edit), then sign in as them. → **"This account is disabled"**, code
  `ACCOUNT_DISABLED`. Distinct from A-02.

### Lockout

- [ ] **A-08 — Five failures locks the account.** Fail the password **5 times** on one
  account. → The 5th attempt sets a lock. The 6th attempt returns
  **"Too many attempts — try again in 60s"**, code `ACCOUNT_LOCKED`.
- [ ] **A-09 — Countdown is live.** Retry a few seconds later. → The number in the message
  has decreased.
- [ ] **A-10 — Lock expires after 60s.** Wait out the minute, sign in correctly. → Succeeds.
- [ ] **A-11 — The counter resets on lock.** After A-08's lock expires, fail **once**, then
  sign in correctly. → Succeeds. (`failedAttempts` was zeroed when the lock was set, so a
  single post-lock failure must not re-lock.)
- [ ] **A-12 — A correct password clears the counter.** Fail 4 times, sign in successfully,
  sign out, then fail 4 more times. → No lock — the successful sign-in reset the count.
- [ ] **A-13 — Lockout is per-account.** Lock the viewer, then sign in as head. → Head is
  unaffected.

### Forced password change

- [ ] **A-14 — First sign-in is redirected.** Any fresh account. → `/login/set-password`.
- [ ] **A-15 — The console is unreachable until it's done.** While on `/login/set-password`,
  manually navigate to `/`, `/payments`, `/desk`, `/live`. → Each bounces straight back to
  `/login/set-password`.
- [ ] **A-16 — Wrong current password.** → **"Your current password is incorrect"**,
  `INVALID_CREDENTIALS`. The new password is not applied.
- [ ] **A-17 — Confirm mismatch.** Type differing new/confirm. → Inline **"Passwords do not
  match"** on the confirm field; submit stays disabled.
- [ ] **A-18 — Success.** Set a valid new password. → `mustChangePassword` clears, you land
  in the console, and the topbar works. Sign out and back in with the **new** password.
- [ ] **A-19 — The old password no longer works.** After A-18. → `INVALID_CREDENTIALS`.

### Password policy — one case per rule

Each of these must be **rejected** with code `PASSWORD_TOO_WEAK`, and only the **first**
failing rule is reported (the error carries `check.problems[0]`, not the full list):

- [ ] **A-20 —** `Abc12345` (8 chars) → *"Use at least 10 characters"*
- [ ] **A-21 —** `ABCDEFGH12` (no lowercase) → *"Add a lowercase letter"*
- [ ] **A-22 —** `abcdefgh12` (no uppercase) → *"Add an uppercase letter"*
- [ ] **A-23 —** `AbcdefghIj` (no digit) → *"Add a number"*
- [ ] **A-24 — Common words**, each rejected with *"Avoid common words like "password" or
  the fest name"*: `Password123`, `Qwerty1234A`, `Letmein123A`, `Welcome123A`,
  `Admin123456A`, `Gateways26X1`, `Registration1A`, `Changeme123A`, `Iloveyou123A`,
  `Abcd12345678` containing `12345678`.
- [ ] **A-25 — The check is case-insensitive.** `PASSWORD1234a` → still rejected.
- [ ] **A-26 — Email local-part.** Signed in as `head@gateways26.in`, try `MyHead12345`.
  → *"Do not put your email address in your password"*.
- [ ] **A-27 — Short local-parts are exempt.** A local-part of ≤2 characters is not checked —
  verify with a staff account whose email starts with e.g. `ab@`.
- [ ] **A-28 — First problem only.** Try `abc` (fails length, uppercase **and** digit).
  → Exactly one message shown.
- [ ] **A-29 — Strength meter is independent of pass/fail.** Type `Abcdefghi1` (10 chars,
  no symbol). → Accepted by the rules, but the meter reads **"Fair"**, not "Strong". Add a
  symbol and 4+ more characters → **"Strong"**.
- [ ] **A-30 — Meter labels.** Walk the meter through *Too weak → Weak → Fair → Good →
  Strong* by lengthening and adding character classes.
- [ ] **A-31 — Fresh salt on change.** Change a password twice to the *same* value; the
  stored hash must differ between the two (inspect via `/dev/data-test` or the overlay).

### Session

- [ ] **A-32 — Session key written.** After sign-in, `localStorage["gateways.session.v1"]`
  holds `staffId, name, email, role, issuedAt, expiresAt, mustChangePassword`.
- [ ] **A-33 — Password is never in the session, or anywhere.** Search the whole of
  `localStorage` for any plaintext password. → No hits. Staff records hold only a 64-hex
  `passwordHash` and a salt.
- [ ] **A-34 — Survives reload.** Reload the page. → Still signed in, no flash of the login
  screen (an `AuthGate` skeleton with `aria-busy` shows instead).
- [ ] **A-35 — 12h expiry.** Hand-edit `expiresAt` in the session record to a past ISO
  timestamp, reload. → Signed out, redirected to `/login`, and the key is removed.
- [ ] **A-36 — Sliding refresh.** Set `expiresAt` to ~30 minutes ahead (inside the 1h refresh
  window), reload, then re-read the key. → `expiresAt` has been pushed out by a **fresh full
  12 hours**.
- [ ] **A-37 — No refresh outside the window.** Set `expiresAt` to ~6 hours ahead, reload,
  re-read. → **Unchanged**.
- [ ] **A-38 — Malformed session.** Replace the value with `{"nonsense":true}` or
  `not-json`, reload. → Treated as signed out and the key is cleared; no crash.
- [ ] **A-39 — Deep-link while signed out.** Sign out, then paste `/payments/queue`,
  `/participants`, `/desk`, `/live` into the address bar. → Each redirects to `/login`.
- [ ] **A-40 — Dev routes are not gated.** `/dev/data-test` and `/dev/kitchen-sink` load
  while signed out **in dev**, and 404 in a production build.
- [ ] **A-41 — Already signed in visiting `/login`.** → Bounced into the console.
- [ ] **A-42 — Sign out.** Avatar menu → Sign out. → Key removed, redirect to `/login`, and
  the Back button does not restore a working console.
- [ ] **A-43 — Cross-tab sign-out.** Open two tabs, sign out in one. → The other drops to
  `/login` without a manual reload (`storage` event).
- [ ] **A-44 — Cross-tab sign-in.** Signed out in both tabs, sign in on one. → The other
  picks the session up.
- [ ] **A-45 — Blocked storage.** Open in a private window with storage blocked, or stub
  `localStorage.setItem` to throw. → Sign-in still works for the tab (in-memory fallback);
  a reload signs you out. No white screen.
- [ ] **A-46 — Audit trail.** Sign in, change a password, sign out, then as head open
  `/audit`. → `auth.signed_in`, `auth.password_changed`, `auth.signed_out` entries with the
  right actor.
- [ ] **A-47 — `lastLoginAt` updates.** Check the Team screen after signing in as an operator.
- [ ] **A-48 — Demo panel.** Expand *Demo accounts* on `/login`. → All five emails and
  **plaintext passwords** are printed, each row click-fills the form. See
  [section 10](#10-known-defects) — confirm this is intended demo behaviour.
- [ ] **A-49 — Login-screen Reset.** Click **Reset** in the demo panel. → Data resets and
  the page reloads (~600ms); previously changed passwords are back to the defaults.

### Missing by design — confirm each is genuinely absent

- [ ] **A-50 —** No "forgot password" link anywhere on `/login`.
- [ ] **A-51 —** No idle/inactivity timeout — leave a tab open and idle for 30+ minutes, it
  stays signed in until the 12h TTL.
- [ ] **A-52 —** No "sign out of all devices", no MFA, no email verification, no self-service
  profile edit.

---

## 2. Permissions — admin vs operator (`P-`)

The map below is the single source of truth (`src/lib/auth/permissions.ts`). **Every role
can read every screen**; only mutations are gated.

| Capability | Head | Coordinator | Finance | Desk | Viewer |
|---|:-:|:-:|:-:|:-:|:-:|
| `registrations.write` — Create & edit registrations | ✓ | ✓ | | ✓ | |
| `registrations.cancel` — Cancel registrations | ✓ | ✓ | | | |
| `payments.verify` — Verify payments | ✓ | ✓ | ✓ | | |
| `payments.collect` — Collect payment at the desk | ✓ | | | ✓ | |
| `refunds.request` — Request a refund | ✓ | ✓ | ✓ | | |
| `refunds.approve` — Approve a refund | ✓ | | | | |
| `settlements.reconcile` — Reconcile the bank statement | ✓ | | ✓ | | |
| `documents.review` — Review documents | ✓ | ✓ | | | |
| `accommodation.allot` — Allot accommodation | ✓ | ✓ | | | |
| `travel.manage` — Manage travel & pickups | ✓ | ✓ | | | |
| `attendance.checkin` — Check participants in | ✓ | ✓ | | ✓ | |
| `comms.send` — Send broadcasts | ✓ | ✓ | | | |
| `certificates.issue` — Issue certificates | ✓ | ✓ | | | |
| `helpdesk.manage` — Work helpdesk tickets | ✓ | ✓ | | ✓ | |
| `events.manage` — Edit events | ✓ | ✓ | | | |
| `staff.manageRoles` — Change staff roles | ✓ | | | | |
| `participants.erase` — Erase personal data | ✓ | | | | |

### The allowed path — one case per capability

Sign in as an **allowed** role and perform the action. It must succeed and appear in
`/audit`.

- [ ] **P-01** `registrations.write` as **desk** — create a walk-in at `/desk`.
- [ ] **P-02** `registrations.cancel` as **coordinator** — cancel from the registration drawer.
- [ ] **P-03** `payments.verify` as **finance** — approve one from `/payments/queue`.
- [ ] **P-04** `payments.collect` as **desk** — collect cash at `/desk`.
- [ ] **P-05** `refunds.request` as **finance** — raise a refund.
- [ ] **P-06** `refunds.approve` as **head** — approve it.
- [ ] **P-07** `settlements.reconcile` as **finance** — match a statement line.
- [ ] **P-08** `documents.review` as **coordinator** — approve a document.
- [ ] **P-09** `accommodation.allot` as **coordinator** — allot a bed.
- [ ] **P-10** `travel.manage` as **coordinator** — assign a pickup slot.
- [ ] **P-11** `attendance.checkin` as **desk** — check someone in.
- [ ] **P-12** `comms.send` as **coordinator** — send a broadcast.
- [ ] **P-13** `certificates.issue` as **coordinator** — bulk-issue certificates.
- [ ] **P-14** `helpdesk.manage` as **desk** — work a ticket.
- [ ] **P-15** `events.manage` as **coordinator** — edit an event.
- [ ] **P-16** `staff.manageRoles` as **head** — change a role at `/team`.
- [ ] **P-17** `participants.erase` as **head** — erase a participant.

### The denied path — one case per capability

Sign in as a role **without** the capability and attempt the same action. The write must
fail with a red toast titled with the message and described with the code `FORBIDDEN`:

> Your role cannot do this — "*capability*" requires *Role* or *Role*

- [ ] **P-18** `registrations.write` denied to **finance** and **viewer**.
- [ ] **P-19** `registrations.cancel` denied to **finance**, **desk**, **viewer**.
- [ ] **P-20** `payments.verify` denied to **desk**, **viewer**.
- [ ] **P-21** `payments.collect` denied to **coordinator**, **finance**, **viewer**.
- [ ] **P-22** `refunds.request` denied to **desk**, **viewer**.
- [ ] **P-23** `refunds.approve` denied to **coordinator**, **finance**, **desk**, **viewer**.
- [ ] **P-24** `settlements.reconcile` denied to **coordinator**, **desk**, **viewer**.
- [ ] **P-25** `documents.review` denied to **finance**, **desk**, **viewer**.
- [ ] **P-26** `accommodation.allot` denied to **finance**, **desk**, **viewer**.
- [ ] **P-27** `travel.manage` denied to **finance**, **desk**, **viewer**.
- [ ] **P-28** `attendance.checkin` denied to **finance**, **viewer**.
- [ ] **P-29** `comms.send` denied to **finance**, **desk**, **viewer**.
- [ ] **P-30** `certificates.issue` denied to **finance**, **desk**, **viewer**.
- [ ] **P-31** `helpdesk.manage` denied to **finance**, **viewer**.
- [ ] **P-32** `events.manage` denied to **finance**, **desk**, **viewer**.
- [ ] **P-33** `staff.manageRoles` denied to all four operator roles.
- [ ] **P-34** `participants.erase` denied to all four operator roles.

### How denial *presents* — the important asymmetry

Only **5 buttons in 2 screens** are wrapped in `GatedButton` (disabled + tooltip). Every
other destructive control in the app is a plain enabled button that only fails on click.

- [ ] **P-35 — Correctly gated: payment queue.** As **desk** or **viewer**, open
  `/payments/queue`. → Approve / Reject / Request re-upload are **visibly disabled**, and
  hovering shows a tooltip naming the roles needed ("Needs Registration Head, Coordinator or
  Finance Verifier"). They are **disabled, not hidden** — that is intentional.
- [ ] **P-36 — Correctly gated: documents.** As **finance** or **viewer**, `/documents`.
  → Approve / Reject disabled with a tooltip.
- [ ] **P-37 — Ungated: bulk actions.** As **viewer**, `/registrations` → select rows →
  the bulk bar's Confirm / Waitlist / Reject / Cancel are **fully enabled**. Click Confirm.
  → **See [X-BUG-01](#10-known-defects): you get a green *"Confirmed N registrations"* toast
  and nothing changes.** Reload and confirm the statuses are untouched.
- [ ] **P-38 — Ungated: erase.** As **coordinator**, `/participants` → open a participant →
  **Erase personal data** is enabled, and the confirm modal opens. Confirm → red `FORBIDDEN`
  toast. Record that a destructive confirm dialog was reachable by a role that cannot perform
  the action.
- [ ] **P-39 — Ungated: allotment.** As **finance**, `/accommodation` → Allot is enabled →
  fails on click.
- [ ] **P-40 — Ungated: coupons.** As **viewer**, `/settings/fees` → Enable/Disable on a
  coupon row is enabled → fails on click.
- [ ] **P-41 — Ungated: certificates, travel, comms, helpdesk.** Repeat the pattern on
  `/certificates`, `/travel`, `/communications`, `/helpdesk` as a denied role.

### Head-only messages and edge cases

- [ ] **P-42 — Refund approval has its own message.** As **finance**, approve a refund.
  → **"Only the Registration Head can approve a refund"** — different wording from the
  generic `assertCan` message. Both are correct; verify the text.
- [ ] **P-43 — Role change has its own message.** As **coordinator**, change a role at
  `/team`. → **"Only the Registration Head can change roles"**.
- [ ] **P-44 — Authorisation runs before validation.** As **viewer**, submit a form that is
  *also* invalid (e.g. a walk-in with a 3-digit phone, bypassing the disabled button via the
  console). → The error is `FORBIDDEN`, **not** `VALIDATION_FAILED`. Permission is checked
  first so a denied role learns nothing about the data.
- [ ] **P-45 — Viewer can read everything.** As **viewer**, walk all 30 routes in the
  sidebar. → Every screen renders real data; no blank pages, no permission errors on read.
- [ ] **P-46 — Viewer holds zero capabilities.** `/settings/roles` as viewer. → The viewer
  column has **no ticks at all**, and the viewer's own column is highlighted.
- [ ] **P-47 — The matrix is read-only.** `/settings/roles` as **head**. → Nothing in the
  matrix is clickable; roles change only at `/team`.
- [ ] **P-48 — The matrix matches enforcement.** Compare every cell on `/settings/roles`
  against the table above and against the actual P-01…P-34 results. Any cell that advertises
  a permission the repository refuses is a bug.
- [ ] **P-49 — No "act as" switcher.** Confirm there is no role-impersonation control
  anywhere; the only way to test another role is to sign out and back in.
- [ ] **P-50 — Head demoting the last head.** As **head**, change your **own** role to
  viewer at `/team`. → Record what happens. There is no guard against removing the last head;
  if it succeeds you lose all admin access and must reset the data to recover. Do this case
  **last**, then reset.
- [ ] **P-51 — Role change takes effect immediately.** As head, demote the coordinator to
  viewer. Sign in as that coordinator. → Writes now fail; `/settings/roles` highlights the
  viewer column.
- [ ] **P-52 — Not authenticated.** Sign out, then trigger a write via a stale tab.
  → `NOT_AUTHENTICATED`, not a silent no-op.

---

## 3. Registrations (`R-`)

Screens: `/registrations`, `/registrations/waitlist`, `/registrations/duplicates`,
`/registrations/clashes`, `/registrations/import`.

### Lifecycle

- [ ] **R-01 — Statuses render.** All five of `pending`, `confirmed`, `waitlisted`,
  `cancelled`, `rejected` appear with distinct badge tones and correct labels.
- [ ] **R-02 — Confirm.** Open a pending registration's drawer → Confirm. → Status flips,
  `confirmedAt` is set, the row updates without a reload, `/audit` logs
  `registration.status_changed`.
- [ ] **R-03 — Confirm is disabled when already confirmed.** → The drawer's Confirm button is
  disabled for a confirmed record.
- [ ] **R-04 — Waitlist from the drawer.** → Status becomes `waitlisted`.
- [ ] **R-05 — Moving off the waitlist clears the position.** Waitlist a record, note its
  `waitlistPosition`, then confirm it. → Position is cleared to null.
- [ ] **R-06 — Cancel requires a reason.** Cancel from the drawer. → `cancelReason` and
  `cancelledAt` are recorded and shown in the activity tab.

### Duplicate and closed-event rules

- [ ] **R-07 — Duplicate registration refused.** As desk, register a participant for an event
  they already have a live registration on. → `ALREADY_REGISTERED` —
  **"Already registered as R######"**.
- [ ] **R-08 — A cancelled registration does not block a re-register.** Cancel a registration,
  then register the same person for the same event again. → Succeeds. (Only `pending`,
  `confirmed` and `waitlisted` block.)
- [ ] **R-09 — A rejected registration does not block either.** Same as R-08 with `rejected`.
- [ ] **R-10 — Closed event refused.** Set an event to `registration_closed` at `/events`,
  then try to register. → `REGISTRATION_CLOSED` — **"*Event title* is not accepting
  registrations"**.
- [ ] **R-11 — Cancelled event refused.** Same, with event status `cancelled`.
- [ ] **R-12 — Unknown event.** → `NOT_FOUND` — "Event not found".

### Capacity and the waitlist

- [ ] **R-13 — Registering past capacity silently waitlists.** Pick an event with a finite
  `capacity`, fill it, then register one more. → The registration is **created** with status
  `waitlisted` and `waitlistPosition = n+1`, and the toast is a **success**, not an error.
  Note: `EVENT_FULL` exists as an error code but this path never throws it.
- [ ] **R-14 — Unlimited events never waitlist.** An event with `capacity: null` accepts any
  number.
- [ ] **R-15 — Capacity counts pending *and* confirmed.** Confirm some and leave others
  pending; both consume seats. Cancelled and rejected do not.
- [ ] **R-16 — Cancelling a live seat promotes the first waitlister.** On a full event with a
  waitlist, cancel a confirmed registration. → The earliest waitlister flips to `pending`,
  its position clears, `/audit` logs `registration.promoted` with
  *"Seat freed by R######"*.
- [ ] **R-17 — The rest of the queue renumbers.** After R-16, positions of everyone behind
  become 1, 2, 3… with no gaps.
- [ ] **R-18 — Cancelling a *waitlisted* record promotes nobody.** → No promotion event.
- [ ] **R-19 — Cancelling on an event with an empty waitlist.** → No promotion, no error.
- [ ] **R-20 — Waitlist screen.** `/registrations/waitlist` → pick an event in the select →
  the queue lists in position order → promote manually and confirm the renumbering.

### Bulk actions

- [ ] **R-21 — Bulk confirm as an allowed role.** As coordinator, select 5 rows → Confirm.
  → All five change; toast reports 5.
- [ ] **R-22 — Selection survives nothing it shouldn't.** Change a filter with rows selected →
  confirm the bulk bar count is consistent with what is actually selected.
- [ ] **R-23 — Bulk waitlist / reject / cancel.** Each applies to every selected row.
- [ ] **R-24 — "Remind" sends nothing.** Select rows → Remind. → A toast appears but **no
  message log entry is created** at `/communications`. It is a stub.
- [ ] **R-25 — No confirmation on destructive bulk actions.** Bulk **Reject** and bulk
  **Cancel** apply immediately with **no confirm dialog** and no undo. Record this.
- [ ] **R-26 — Partial failure is invisible.** As **viewer**, bulk-confirm 30 rows. → Success
  toast, zero rows changed. See [X-BUG-01](#10-known-defects).

### Filtering, search, export

- [ ] **R-27 — Search debounces at 220ms** and matches code, name, email and phone.
- [ ] **R-28 — All five facets.** Status, Payment, Track, Category, Source — each narrows the
  table and shows a count per option.
- [ ] **R-29 — Facets combine (AND).** Status=confirmed + Track=technical → only rows
  matching both.
- [ ] **R-30 — Chips remove individually**, "Clear *facet*" clears one, "Clear all" resets.
- [ ] **R-31 — `N of M` counter** matches the table body.
- [ ] **R-32 — Empty result.** Filter to nothing. → *"No registrations match these filters"*
  with a hint, not a blank table.
- [ ] **R-33 — Saved views.** Save the current filters, clear, re-apply from the Saved views
  popover. → Restores exactly.
- [ ] **R-34 — Column visibility.** Hide columns via the Columns popover; the export is
  unaffected (it always writes 11 columns).
- [ ] **R-35 — Export CSV.** → Downloads, opens in a spreadsheet, has 11 columns, and the row
  count matches the **filtered** set, not the whole table.
- [ ] **R-36 — Export with a comma or quote in a field.** Add a participant whose name
  contains `,` and `"`, export, reopen. → Fields are correctly quoted, columns don't shift.
- [ ] **R-37 — Default sort** is `registeredAt` descending.
- [ ] **R-38 — Pagination at 30/page**; the page resets to 1 when a filter changes the row
  count.

### The drawer

- [ ] **R-39 — Four tabs.** Overview, Payments (with a count), Documents (with a count),
  Activity. Counts match the tab contents.
- [ ] **R-40 — "Badge blocked" banner.** Open a registration for someone with missing
  badge-gating documents (a minor without `guardian_consent`). → Warning banner appears.
- [ ] **R-41 — Empty tab states.** A registration with no payment → *"No payment recorded
  yet."*; none uploaded → *"Nothing uploaded yet."*
- [ ] **R-42 — Activity is chronological** and shows the actor.

### Hygiene screens

- [ ] **R-43 — Duplicates.** `/registrations/duplicates` → the **Aditya Sharma / ADITYA
  SHARMA** pair is detected on the shared phone despite the different name casing and email.
- [ ] **R-44 — Merge.** Merge them → one record survives, registrations from both are
  attached, `/audit` records it.
- [ ] **R-45 — Empty state.** After merging every duplicate → *"No duplicates detected"*.
- [ ] **R-46 — Participant clashes.** `/registrations/clashes` → someone registered for two
  events whose times overlap is listed.
- [ ] **R-47 — Venue clashes.** Two events in the same venue with overlapping windows are
  listed separately from participant clashes.
- [ ] **R-48 — No false positives.** Back-to-back events that touch but do not overlap are
  **not** flagged.

### CSV import — `/registrations/import`

Expected header set: `name, email, phone, gender, dob, college, department, year, category,
events`. Headers are normalised to letters only, so `Full Name` and `full_name` both match
`name`.

- [ ] **R-49 — Template download** produces a file with those columns.
- [ ] **R-50 — Dry run is non-destructive.** Upload a file → the four summary tiles
  (create / update / skip / error) populate and **nothing is written** until Commit.
- [ ] **R-51 — Missing name.** Blank name → row error **"Missing name"**.
- [ ] **R-52 — Short phone.** 9 digits → **"Phone must be 10 digits"**.
- [ ] **R-53 — Phone with formatting passes.** `+91 98765 43210` → accepted (non-digits are
  stripped before counting).
- [ ] **R-54 — Invalid email.** `foo@bar` (no dot) and `foo bar@x.com` → **"Email looks
  invalid"**.
- [ ] **R-55 — Empty email is allowed.** → No email error.
- [ ] **R-56 — Unknown college.** → **`Unknown college "X"`**.
- [ ] **R-57 — College matches on short name or full name, case-insensitively.** `nitk`,
  `NITK` and the full institution name all resolve.
- [ ] **R-58 — Unknown category.** → **`Unknown category "X"`**; a **blank** category
  defaults to `participant` with no error.
- [ ] **R-59 — Unknown events.** → **`Unknown events: …`**, listing each unmatched one.
- [ ] **R-60 — Event separators.** Both `;` and `|` split multiple events; event slug and
  event title both match.
- [ ] **R-61 — Line numbers are 1-based on the data rows.** An error on the first data row
  reports **line 2** (the header is line 1).
- [ ] **R-62 — Multiple problems on one row** are all listed for that row.
- [ ] **R-63 — Any error makes the row `error`** and it is excluded from the commit.
- [ ] **R-64 — Update detection.** A row whose phone shares its **last 10 digits** with an
  existing participant → marked `update` with *"Matches existing GWS26-00001 — will update,
  not duplicate"*.
- [ ] **R-65 — Commit does not actually update.** Commit a file containing only `update`
  rows. → They are counted as **skipped** and **nothing is changed** on the existing records.
  See [X-BUG-02](#10-known-defects).
- [ ] **R-66 — Defaults on created rows.** A minimal row creates a participant with T-shirt
  `M`, diet `veg`, DOB `2005-01-01`, department `Computer Science`, year 1, empty emergency
  contact, and — if the college was blank — the **first college** as a fallback.
- [ ] **R-67 — Export errors CSV** contains exactly the error rows with their messages.
- [ ] **R-68 — Empty file** → handled with a message, not a crash.
- [ ] **R-69 — Header-only file** → 0 of everything, no crash.
- [ ] **R-70 — Non-CSV file** (a PDF renamed `.csv`, or a `.xlsx`) → handled gracefully.
- [ ] **R-71 — CRLF line endings and a UTF-8 BOM** parse correctly (Excel's default export).
- [ ] **R-72 — Quoted fields containing commas** parse into one field.
- [ ] **R-73 — Large file.** 500+ rows → the preview table paginates at 25 and stays
  responsive.
- [ ] **R-74 — Re-committing the same file** → every row is now an `update`, so nothing
  duplicates.
- [ ] **R-75 — Import as a denied role.** As **viewer** or **finance**, commit an import.
  → `FORBIDDEN`.

---

## 4. Payments & finance (`$-`)

Screens: `/payments` (ledger), `/payments/queue`, `/payments/dues`, `/payments/refunds`,
`/payments/settlements`, `/payments/fraud`, `/payments/drawer`.

Fee model to check against: base fees **participant ₹350 · delegate ₹250 · accompanist ₹150
· faculty/volunteer/guest ₹0**; early bird **−20%** (ended 5 Jan 2026); group **−15%** at
**10+** people; on-spot surcharge **+₹100**; accommodation **₹1200/night**.
Methods needing a UTR: **upi, neft, gateway**. Cash does **not**.

### Verification queue

- [ ] **$-01 — Queue lists only pending payments.** Verified, rejected and refunded ones are
  absent.
- [ ] **$-02 — Approve.** As finance, approve one. → Status `verified`, `reviewedBy`,
  `reviewedAt` set, the row leaves the queue, dues drop on `/payments/dues` and on the
  overview KPI.
- [ ] **$-03 — Invoice serial is assigned on verification**, not on submission — a pending
  payment has no `invoiceSerial`.
- [ ] **$-04 — Serials are gap-free.** Verify three in a row. → Consecutive serials with no
  gaps.
- [ ] **$-05 — Verification is idempotent.** Verify the same payment twice (re-open it from
  the ledger). → The original record is returned; **no second invoice serial is burned**.
  Note `ALREADY_VERIFIED` exists as a code but is never thrown — idempotency is the design.
- [ ] **$-06 — Reject.** → Status `rejected`, the canned reason is stored and shown, the
  participant's dues stay outstanding.
- [ ] **$-07 — Reject requires a reason.** → The modal's select must be filled.
- [ ] **$-08 — Request re-upload.** → Distinct from reject; the payment stays actionable.
- [ ] **$-09 — Keyboard driver.** With a payment focused: **J / ↓** next, **K / ↑** previous,
  **A** approve, **R** reject, **U** request re-upload.
- [ ] **$-10 — Keys are inert while typing.** Focus the reject-reason field and type a word
  containing `a`, `r`, `u`, `j`, `k`. → No action fires.
- [ ] **$-11 — Prev/next in the review pane** stays in sync with the list selection.
- [ ] **$-12 — Queue caps at 200.** With more than 200 pending, only the first 200 render and
  a footer notice says so. Verify the notice appears and is honest about the remainder.
- [ ] **$-13 — SLA breach banner** appears for payments older than the threshold.
- [ ] **$-14 — Empty queue.** Clear it. → *"Queue is clear — Every submitted payment has been
  reviewed. This is the goal."*
- [ ] **$-15 — Sidebar badge** count matches the queue length, and shows `999+` above 999.
- [ ] **$-16 — Denied roles see disabled buttons with a tooltip** (see P-35).

### Recording a payment

- [ ] **$-17 — Duplicate UTR refused.** Record a payment reusing an existing UTR. →
  `UTR_ALREADY_USED`.
- [ ] **$-18 — UTR uniqueness spans statuses.** A UTR used on a *rejected* payment — confirm
  the observed behaviour and record it.
- [ ] **$-19 — Breakdown must sum to the amount.** Submit a payment whose `breakdown` lines
  do not total `amount`. → `AMOUNT_MISMATCH`.
- [ ] **$-20 — Cash needs no UTR.** Method `cash` → the UTR field is hidden and submission
  works without one.
- [ ] **$-21 — UPI / NEFT / gateway need a UTR** of at least 6 characters — the submit button
  stays disabled below that.
- [ ] **$-22 — Zero and negative amounts refused** — the button is disabled at `0`, and a
  negative value cannot be submitted.
- [ ] **$-23 — Non-numeric amount** is rejected or coerced safely, never `NaN` in the ledger.

### Ledger and dues

- [ ] **$-24 — Ledger totals** match the sum of the filtered rows, and the overview's
  "Revenue collected" tile matches the verified total.
- [ ] **$-25 — Ledger facets** (method, status) filter correctly; export CSV matches the
  filtered set.
- [ ] **$-26 — Dues ageing chart** buckets correctly; a payment moving to `verified` leaves
  the ageing chart.
- [ ] **$-27 — Partial payment.** Kavya Hegde's record shows an amount paid **and** an amount
  still due; she appears on `/payments/dues`.
- [ ] **$-28 — Zero-fee participants** (faculty, volunteer, guest) show ₹0 due and do not
  appear in dues.
- [ ] **$-29 — Currency formatting** is `₹` with Indian grouping (`₹1,20,000`) everywhere —
  tiles, tables, exports, badge sheets.

### Refunds

- [ ] **$-30 — Refund tiers.** 21+ days before the fest → **100%**; 10–20 days → **50%**;
  under 10 days → **0%**. Verify each boundary.
- [ ] **$-31 — Unverified payment cannot be refunded.** → `PAYMENT_NOT_VERIFIED` — *"Only a
  verified payment can be refunded"*.
- [ ] **$-32 — Refund cannot exceed paid-minus-already-refunded.** → `REFUND_EXCEEDS_PAID`.
- [ ] **$-33 — Two partial refunds** summing to the paid amount both succeed; a third fails.
- [ ] **$-34 — Request vs approve are separate steps.** Finance can request; only head
  approves (P-06 / P-42).
- [ ] **$-35 — Payout modal** requires a payout reference; the reference is stored and shown
  on the row.
- [ ] **$-36 — Refunded payments** show status `refunded` in the ledger and reduce revenue.

### Settlements and fraud

- [ ] **$-37 — Bank-statement template downloads** with the expected columns.
- [ ] **$-38 — Statement import** parses and populates the two worklists (matched /
  unmatched), 12 rows per page.
- [ ] **$-39 — Auto-match** pairs statement lines to payments by UTR and amount.
- [ ] **$-40 — Manual match modal** links an unmatched line to a payment; it disappears from
  the unmatched list.
- [ ] **$-41 — Malformed statement file** is handled with a message, not a crash.
- [ ] **$-42 — Fraud sweep.** Run it from `/payments/fraud` (and from the queue). → Flags
  populate `fraudFlags[]` and the flagged list; running it twice does not duplicate flags.
- [ ] **$-43 — A flagged payment is still reviewable** — the flag warns, it does not block.

### Cash drawer

- [ ] **$-44 — Close the shift, balanced.** Enter a counted amount equal to the expected
  total. → **Success** toast, shift closes.
- [ ] **$-45 — Close the shift, over/short.** Enter a different amount. → **Warning** toast
  naming the variance; the shift still closes and the variance is recorded.
- [ ] **$-46 — Blank or zero count** is handled explicitly.
- [ ] **$-47 — A closed shift cannot be re-closed.**

---

## 5. Logistics (`L-`)

### Documents — `/documents`

- [ ] **L-01 — Required docs are derived, not stored.** A `participant` needs `college_id`
  and `bonafide`; a `delegate` needs `college_id`; `faculty` needs `institution_letter`;
  `volunteer` and `guest` need none.
- [ ] **L-02 — Minor rule.** Ananya Iyer and Nikhil Gupta (both 17 on 8 Oct 2026) have
  **`guardian_consent`** added automatically.
- [ ] **L-03 — The minor rule keys off the fest start date**, not today — someone turning 18
  after 8 Oct 2026 is still a minor here.
- [ ] **L-04 — Indemnity rule.** Register someone for an event with `requiresIndemnity` →
  **`indemnity`** is added to their required docs. Cancel that registration → it is removed.
- [ ] **L-05 — ID proof rule.** Create an accommodation request → **`id_proof`** is added.
- [ ] **L-06 — Badge gating.** `college_id`, `bonafide`, `guardian_consent`, `indemnity` gate
  the **badge**; a participant missing any of them cannot have a badge printed (D-14).
- [ ] **L-07 — Accommodation gating.** `guardian_consent` and `id_proof` gate
  **accommodation**.
- [ ] **L-08 — `institution_letter` gates nothing** — it is collected but blocks neither.
- [ ] **L-09 — Approve / reject a document** as an allowed role → the participant's
  `docsComplete` flag and the completeness table update.
- [ ] **L-10 — Export gaps CSV** lists exactly the participants with missing documents.
- [ ] **L-11 — Denied roles get disabled buttons with a tooltip** (P-36).
- [ ] **L-12 — Sidebar badge** matches the pending review count.

### Accommodation — `/accommodation`

Blocks: Nilgiri (male, 3×12×4), Kaveri (male, 3×10×4), Malabar (female, 3×12×4),
Sharavathi (female, 2×10×4), Guest House (any, 2×6×2).

- [ ] **L-13 — Outstanding dues block allotment.** Allot a bed to Rohan Deshpande (unpaid).
  → `PAYMENT_NOT_VERIFIED` — **"₹N still outstanding — cannot allot"**, with the real figure.
- [ ] **L-14 — Missing documents block allotment.** → `DOCS_INCOMPLETE` — **"Missing: …"**
  listing the actual document labels.
- [ ] **L-15 — Gender mismatch.** Allot a male participant into Malabar or Sharavathi.
  → `GENDER_MISMATCH`.
- [ ] **L-16 — Guest House accepts any gender** (`gender: "any"`).
- [ ] **L-17 — Room full.** Fill all 4 beds in a room, allot a 5th. → `ROOM_FULL` —
  **"Room N has all 4 beds taken"**.
- [ ] **L-18 — Specific bed taken.** Request an occupied bed number. → `ROOM_FULL` —
  **"Bed N in room M is taken"** (different message from L-17).
- [ ] **L-19 — Guest House rooms hold 2**, not 4 — the room-full message says 2.
- [ ] **L-20 — Happy allotment** with dues cleared, docs complete, matching gender → succeeds
  and appears on the allotment list.
- [ ] **L-21 — Order of checks.** A participant who is *both* unpaid *and* missing docs → the
  dues error fires first. Record the order.
- [ ] **L-22 — Hostel check-in modal** — key and bedding checkboxes persist.
- [ ] **L-23 — Nightly charge** is ₹1200 × nights and lands on the participant's dues.
- [ ] **L-24 — Cancelling an accommodation request** removes the `id_proof` requirement
  (inverse of L-05) and frees the bed.
- [ ] **L-25 — Export CSV** matches the filtered request list.

### Travel — `/travel`

- [ ] **L-26 — Arrival / departure toggle** switches the manifest.
- [ ] **L-27 — Assign a pickup slot** → the participant appears under that slot.
- [ ] **L-28 — Slot capacity** — over-assigning a slot behaves sensibly (record what it does).
- [ ] **L-29 — Participants with `pickup: false`** are not in the pickup manifest.
- [ ] **L-30 — Manifest CSV export** matches the on-screen list including the station.

---

## 6. Desk kiosk (`D-`) — the operator's screen

`/desk` has **no sidebar** and its own auth gate. This is the Desk Volunteer's whole job.

- [ ] **D-01 — Chrome-free layout.** `/desk` renders without the sidebar or breadcrumb.
- [ ] **D-02 — Still gated.** Sign out, visit `/desk` → redirected to `/login`.
- [ ] **D-03 — Function keys.** **F2** new walk-in, **F3** collect payment, **F4** print
  badge, **F8** issue token. **Escape** clears the current selection.
- [ ] **D-04 — Keys are inert while typing** in the search or a form field.
- [ ] **D-05 — Live search.** Fires at **2+ characters**, debounced 160ms, matches name,
  phone and code.
- [ ] **D-06 — No match** → *"No match"* **with a New-walk-in action button** in the empty
  state.
- [ ] **D-07 — Nobody selected** → *"Nobody selected — Search for a participant, or press
  F2"*.

### Walk-in form

- [ ] **D-08 — Required trio.** Submit stays disabled until **name > 2 characters**,
  **phone ≥ 10 digits** and a **college** are all present.
- [ ] **D-09 — A 2-character name is rejected**, a 3-character one is accepted.
- [ ] **D-10 — Phone digit-stripping.** `+91 98765 43210` and `98765-43210` both satisfy the
  10-digit rule; `98765 4321` (9 digits) does not.
- [ ] **D-11 — Whitespace-only name** does not pass (it is trimmed first).
- [ ] **D-12 — Duplicate phone refused.** Enter Aditya Sharma's phone. →
  `DUPLICATE_PARTICIPANT` — **"Phone already registered to GWS26-00001"** naming the real
  code.
- [ ] **D-13 — Duplicate detection strips formatting** — the same number typed with spaces or
  `+91` still collides.
- [ ] **D-14 — Email is optional.** Leave it blank → a synthetic
  `<digits>@walkin.local` address is generated.
- [ ] **D-15 — Optional fields default** — gender, DOB, T-shirt `M`, department
  `Computer Science`, year 2, diet `veg`.
- [ ] **D-16 — New participant gets a code** in the `GWS26-#####` series and
  `createdVia: "on_spot"`, with the note *"Registered at the desk"*.
- [ ] **D-17 — On-spot surcharge** of ₹100 is applied to a desk registration on fest days.

### Payment, badge, check-in, kit

- [ ] **D-18 — Collect is disabled when nothing is due.** Select a fully-paid participant →
  the Collect button is disabled.
- [ ] **D-19 — Collect modal gating.** Submit stays disabled unless amount > 0 and, when the
  method needs one, the UTR is at least 6 characters.
- [ ] **D-20 — Method segmented control** switches the UTR field's visibility; the UPI QR
  panel shows for `upi`.
- [ ] **D-21 — The button label shows the formatted amount** — *"Record ₹350"* — and updates
  live as you type.
- [ ] **D-22 — Cash collection lands in the shift drawer** and shows up at `/payments/drawer`.
- [ ] **D-23 — Print badge disabled unless `docsComplete`.** Select a minor without guardian
  consent → Print is disabled.
- [ ] **D-24 — Badge sheet** opens the print dialog and renders the participant's code,
  category colour and events.
- [ ] **D-25 — Check-in.** Check someone in → the attendance record is created and the
  overview's "Checked in today" tile increments.
- [ ] **D-26 — Check-in is idempotent.** Check the same person in twice → the second returns
  the existing record and says so; no duplicate row. (`ALREADY_CHECKED_IN` is declared but
  never thrown — idempotency is the design.)
- [ ] **D-27 — Issue kit** modal records the issue; a second issue for the same person is
  handled.
- [ ] **D-28 — Issue token (F8)** produces a queue token.

### Offline

- [ ] **D-29 — Offline indicator.** DevTools → Network → Offline. → The desk shows an offline
  state.
- [ ] **D-30 — Writes queue.** Perform a check-in and a collection while offline. → The
  queued-writes counter increments and `localStorage["aurora.desk.queue.v1"]` grows.
- [ ] **D-31 — Queue survives a reload** while still offline.
- [ ] **D-32 — Drain on reconnect.** Go back online. → The queue drains, the counter returns
  to zero, and the records appear in the ledger and attendance.
- [ ] **D-33 — No double-apply.** After draining, confirm each queued write landed **once**.

---

## 7. Engage (`E-`)

### Communications — `/communications`

- [ ] **E-01 — New broadcast modal** — template select, name, audience, channel.
- [ ] **E-02 — Audience preview count** updates when the audience changes and matches the
  number of recipients actually logged.
- [ ] **E-03 — Send** → the broadcast appears in the list and message logs are written.
- [ ] **E-04 — Template editor** saves and the new body is used by the next broadcast.
- [ ] **E-05 — Empty audience** → sending to a segment with nobody in it is handled.
- [ ] **E-06 — Broadcasts paginate at 20, message logs at 30.**
- [ ] **E-07 — Denied roles** (`comms.send`) fail on click — the button is not disabled.

### Certificates — `/certificates`

- [ ] **E-08 — Bulk issue** by event + kind → certificates are created with
  `CERT/GWS26` serials.
- [ ] **E-09 — Re-issuing the same event/kind** does not duplicate.
- [ ] **E-10 — Only eligible participants** (attended / confirmed) receive one — verify the
  rule and record it.
- [ ] **E-11 — Export CSV** matches the table.

### Helpdesk — `/helpdesk`

- [ ] **E-12 — New ticket requires a subject** — submit is disabled with a blank or
  whitespace-only subject.
- [ ] **E-13 — Category and priority** persist on the created ticket.
- [ ] **E-14 — Ticket detail modal** shows the full thread; status changes persist.
- [ ] **E-15 — Sidebar badge** matches open tickets.
- [ ] **E-16 — Desk can work tickets** (`helpdesk.manage`), finance and viewer cannot.

---

## 8. Operate (`O-`)

### Reports — `/reports`

- [ ] **O-01 — All seven reports render**: summary, financial, college, event,
  accommodation, no-show, settlement.
- [ ] **O-02 — Numbers reconcile.** The financial report's collected total equals the
  ledger's verified total and the overview tile. The summary's registration count equals
  `/registrations` unfiltered.
- [ ] **O-03 — Per-report CSV export** downloads and matches the on-screen table.
- [ ] **O-04 — Print** opens the browser print dialog with a readable layout (no clipped
  columns, no dark background bleeding through).
- [ ] **O-05 — Tables paginate at 40.**
- [ ] **O-06 — Reports are readable by every role**, viewer included.

### Team & roster — `/team`

- [ ] **O-07 — Role select is head-only** (P-16 / P-43).
- [ ] **O-08 — Changing a role writes an audit entry** naming the old and new role.
- [ ] **O-09 — Deactivating a member** prevents their sign-in (`ACCOUNT_DISABLED`, A-07).
- [ ] **O-10 — Workload export CSV.**
- [ ] **O-11 — Desk roster grid** renders shifts correctly.
- [ ] **O-12 — Last-head guard.** See **P-50** — run it last.

### Audit — `/audit`

- [ ] **O-13 — Every mutation is logged.** After a full pass, spot-check that registrations,
  payments, refunds, allotments, role changes and auth events all appear.
- [ ] **O-14 — Entity filter and actor filter** each narrow the list; combined they AND.
- [ ] **O-15 — Before/after values** are shown for status changes.
- [ ] **O-16 — Export CSV**, 40 rows per page.
- [ ] **O-17 — The audit log is append-only** — nothing in the UI edits or deletes an entry.
- [ ] **O-18 — Empty filter result** → *"Nothing logged for this filter"*.

### Settings — `/settings`

- [ ] **O-19 — Five tabs** and their deep links: `/settings` (Fest), `/settings/fees`,
  `/settings/roles`, `/settings/privacy`, `/settings/form`. Each URL opens the right tab.
- [ ] **O-20 — Fest tab** shows the dates, serial prefixes and support details from config.
- [ ] **O-21 — Coupon enable/disable** per row (10 per page) takes effect immediately.
- [ ] **O-22 — Coupon validation.** An unknown code, a fully-redeemed code and a code applied
  to the wrong category each fail with `VALIDATION_FAILED`.
- [ ] **O-23 — Duplicate coupon code on create** → `VALIDATION_FAILED`.
- [ ] **O-24 — Reset all data** shows a confirm modal, and cancelling it changes nothing.
- [ ] **O-25 — Reset actually resets** — overlay cleared, passwords back to defaults, all
  seeded records restored.
- [ ] **O-26 — Display tab.** Theme segmented control, density segmented control and the
  reduce-motion toggle all apply immediately and persist across a reload
  (`localStorage["aurora.prefs"]`).
- [ ] **O-27 — Privacy tab copy.** Check the participant count in the copy against the actual
  fixture — see [X-BUG-05](#10-known-defects).

### War room — `/live`

- [ ] **O-28 — Chrome-free and gated.** No sidebar; signed out → `/login`.
- [ ] **O-29 — Forces dark theme on mount** even if the app is in light mode.
- [ ] **O-30 — Restores the previous theme on exit.** Set light mode, visit `/live`, navigate
  away. → Back to light. This is easy to break; check it explicitly.
- [ ] **O-31 — Auto-refresh every 15s** — leave it open and confirm the numbers move as you
  make changes in another tab.

### Command Center — `/`

- [ ] **O-32 — Eight KPI tiles**: Total registrations, Revenue collected, Outstanding dues,
  Verification queue, Participants, Accommodation, Documents pending, Checked in today.
- [ ] **O-33 — Every tile is clickable** and routes to the matching screen with the matching
  count.
- [ ] **O-34 — Charts render**: registrations & revenue area chart, registration funnel,
  revenue-by-method donut, registrations-by-track bar.
- [ ] **O-35 — Needs-attention list** links through to real records.
- [ ] **O-36 — Top colleges, Collection progress, Recent activity** all populate.
- [ ] **O-37 — No event fill-rate heatmap.** It was removed — confirm nothing on the page
  references it and there is no dead `/events?focus=` click-through.
- [ ] **O-38 — Loading skeleton** shows before the seed is built, not a blank page.

---

## 9. Cross-cutting (`X-`)

### Tables

- [ ] **X-01 — Sort every sortable column** ascending then descending; the arrow indicator
  matches.
- [ ] **X-02 — Sorting is stable across pages** — sort, then page forward; the order holds.
- [ ] **X-03 — Page resets when the row count changes.** Go to page 4, apply a filter that
  leaves 5 rows. → You are on page 1 with rows visible, not stranded on an empty page 4.
- [ ] **X-04 — Select-all-on-page** selects only the current page; the header checkbox goes
  **indeterminate** when some rows are selected.
- [ ] **X-05 — Selection and paging.** Select rows, change page, come back — record whether
  the selection survives and whether the bulk-bar count stays truthful.
- [ ] **X-06 — Row click opens the drawer** without toggling the checkbox.
- [ ] **X-07 — Loading skeleton rows** appear while a table loads.
- [ ] **X-08 — Optional / `hideBelow` columns** drop out at narrow widths without breaking
  the layout.

### Filters

- [ ] **X-09 — Facet counts are accurate** and update as other facets narrow the set.
- [ ] **X-10 — Chips, "Clear *facet*", "Clear all"** behave as in R-30 on every screen that
  has a filter bar.
- [ ] **X-11 — Saved views** round-trip on each screen that offers them.
- [ ] **X-12 — Filters are lost on reload.** Apply filters, reload. → They reset. Filter state
  is not in the URL — only `?focus=<id>` deep links exist (participants, teams, events).
  Confirm and record.
- [ ] **X-13 — `?focus=` deep links work** for `/participants`, `/teams`, `/events`, and a
  bad id degrades gracefully.

### Command palette and shortcuts

- [ ] **X-14 — Opens on ⌘K / Ctrl+K and `/`**; `?` opens the shortcuts overlay.
- [ ] **X-15 — Inert while typing.** With focus in a search box, `/` and `?` type characters
  rather than opening overlays.
- [ ] **X-16 — Three result kinds** — people, routes, and the 7 fixed actions.
- [ ] **X-17 — People search fires at 2+ characters**, debounced 140ms.
- [ ] **X-18 — ↑/↓/Enter** navigate and activate; Escape closes.
- [ ] **X-19 — Results cap at 24** and the palette stays responsive.
- [ ] **X-20 — Shortcuts overlay** documents the queue keys (A/R/U/Space) and desk keys
  (F2/F3/F4/F8) and they match the real bindings.

### Shell

- [ ] **X-21 — Sidebar sections, collapse toggle, active-item pressed state.**
- [ ] **X-22 — Mobile drawer + scrim** open and close; the scrim dismisses.
- [ ] **X-23 — Live badge counts** on Verification queue, Documents and Helpdesk match their
  screens and cap at `999+`.
- [ ] **X-24 — Topbar refresh** reloads stats across the app.
- [ ] **X-25 — Announcements bell** opens; empty → *"Nothing new."*
- [ ] **X-26 — Breadcrumb** matches the current route on every screen.
- [ ] **X-27 — Days-to-fest counter** is correct against 8 Oct 2026.
- [ ] **X-28 — Avatar menu** — Settings, Change password, My activity, Sign out all route
  correctly.

### Exports

- [ ] **X-29 — Every export downloads a non-empty file**: registrations, participants,
  payments, dues, attendance, document gaps, accommodation, travel manifest, certificates,
  audit, team workload, import errors, all 7 reports.
- [ ] **X-30 — Each export respects the current filter**, not the whole table.
- [ ] **X-31 — Headers match the columns** and special characters are quoted (R-36).

### Accessibility and responsive

- [ ] **X-32 — Keyboard-only traversal.** Tab through login, the registrations table, a
  drawer and a modal. Focus is visible at every stop and never lost behind an overlay.
- [ ] **X-33 — Modal focus trap** — Tab cycles inside the dialog; Escape closes; focus
  returns to the trigger.
- [ ] **X-34 — `aria-invalid` on errored inputs** and `role="alert"` on the login and
  set-password error blocks.
- [ ] **X-35 — Screen-reader text on the auth gate** — "Checking your session" /
  "Redirecting to sign in".
- [ ] **X-36 — Colour contrast** in both light and dark themes, especially status badges.
- [ ] **X-37 — Reduce-motion** setting actually suppresses animation.
- [ ] **X-38 — Responsive at 375 / 768 / 1280** on the heaviest screens: `/registrations`,
  `/payments/queue`, `/desk`, `/reports`. No horizontal body scroll.
- [ ] **X-39 — Print styles** for the badge sheet and reports.

### Data layer

- [ ] **X-40 — Empty states everywhere.** Filter each list to nothing and confirm a real empty
  state, never a bare table.
- [ ] **X-41 — Mutations survive a reload** (the overlay replays).
- [ ] **X-42 — A corrupt overlay is dropped, not fatal.** Set
  `localStorage["aurora.overlay.v1"]` to `garbage` and reload. → The app boots on the clean
  seed rather than white-screening.
- [ ] **X-43 — Changing the seed** (`aurora.seed.v1`) regenerates a different but coherent
  dataset.
- [ ] **X-44 — Storage quota.** Fill `localStorage` near its limit, then make a change.
  → The write fails **silently** and the session keeps working in memory; nothing crashes.
  Note `STORAGE_UNAVAILABLE` is declared but never thrown, so there is **no user-visible
  warning that a write was lost** — record this.
- [ ] **X-45 — Two tabs, divergent state.** Make changes in tab A, then act in tab B without
  reloading. Record whether B sees A's writes (only the auth key syncs cross-tab).
- [ ] **X-46 — Failed reads look like empty data.** Force a read to fail (sign out in another
  tab, then interact with a stale list). → The screen shows an **empty state**, not an error.
  See [X-BUG-04](#10-known-defects).
- [ ] **X-47 — No route-level error boundary.** Force a render error. → The app blanks; there
  is no `error.tsx`. See [X-BUG-03](#10-known-defects).
- [ ] **X-48 — No custom 404.** Visit `/nonsense`. → Next's default 404, no console chrome.
- [ ] **X-49 — Dead nav match.** The nav config matches `/registrations/new`, a route that
  does not exist; "New registration" correctly links to `/desk` instead. Confirm no link
  reaches the dead route.
- [ ] **X-50 — Console is clean.** No React key warnings, hydration mismatches or uncaught
  promise rejections during a full pass.

---

## 10. Known defects

Found by reading the source. If your observed result matches the *Observed* column, it is a
known issue, not a new find.

| ID | Where | Observed | Impact |
|---|---|---|---|
| **X-BUG-01** | `registrations.bulkSetStatus` | Swallows **every** per-row failure and returns only a count. A viewer bulk-confirming 30 rows sees *"Confirmed 30 registrations"* with **0 rows changed**. | High — a success toast for work that did not happen. Cases P-37, R-26. |
| **X-BUG-02** | `commitImport` | Rows detected as `update` are counted as **skipped** and nothing is updated. The preview promises *"will update, not duplicate"*. | High — the preview lies about what commit does. Case R-65. |
| **X-BUG-03** | `src/app/` | No `error.tsx`, `global-error.tsx`, `not-found.tsx` or `loading.tsx` anywhere. | An uncaught render error blanks the whole app; no custom 404. Cases X-47, X-48. |
| **X-BUG-04** | `useAsync` | Exposes an `error` field **no screen reads**. A failed read renders the *empty* state. | A `NOT_AUTHENTICATED` or thrown read looks like "no data". No retry affordance except the topbar refresh. Case X-46. |
| **X-BUG-05** | `/settings/privacy` | Copy claims *"same 2,414 participants"* against a **20-person** fixture. | Cosmetic but misleading. Case O-27. |
| **X-BUG-06** | `/login` | The demo panel prints **every plaintext password** on screen and offers a one-click data reset. | Intentional for a demo build; **must not ship**. Case A-48. |
| **X-BUG-07** | Bulk Reject / Cancel | No confirmation dialog and no undo, unlike Erase, Reset and Close shift which all confirm. | Destructive action one click away. Case R-25. |
| **X-BUG-08** | `/team` | Nothing stops the head from demoting themselves out of the last head seat. | Locks everyone out of admin until a data reset. Cases P-50, O-12. |
| **X-BUG-09** | Bulk "Remind" | Fires a success toast and sends nothing — no message log entry. | Operators believe reminders went out. Case R-24. |
| **X-BUG-10** | Nav config | Matches `/registrations/new`, a route that does not exist. | Dead config. Case X-49. |
| **X-BUG-11** | `DataErrorCode` | Five declared codes are **never thrown anywhere**: `EVENT_FULL`, `ALREADY_VERIFIED`, `ALREADY_CHECKED_IN`, `MUST_CHANGE_PASSWORD`, `STORAGE_UNAVAILABLE`. | Mostly harmless — the behaviour is handled another way (silent waitlist, idempotency, a redirect). But `STORAGE_UNAVAILABLE` means a lost write is **never surfaced**. Cases R-13, $-05, D-26, X-44. |
| **X-BUG-12** | Gating coverage | `GatedButton` wraps only **5 buttons in 2 screens**. Every other destructive control is enabled for every role and fails on click. | Denied roles reach confirm dialogs for actions they cannot perform. Cases P-37 to P-41. |

### Absent by design — confirm, don't file

No participant/self-service accounts · no forgot-password · no MFA · no idle timeout ·
no "sign out everywhere" · no server-side pagination · no URL-persisted filter state ·
no receipt or document **upload** from the console (both exist only in the seed) ·
no registration-create form outside `/desk` · no role-impersonation switcher.

---

## 11. What the automated suite already covers

`npm test` runs 61 data-layer assertions (also viewable at `/dev/data-test`). Where a case
below is already asserted, a UI failure means the **screen** is wrong, not the data layer.

| Suite group | Assertions | Manual cases it backs |
|---|:-:|---|
| Auth | 11 | A-01…A-31 |
| RBAC | 8 | P-01…P-34, P-44 |
| Fixtures / Seed | 6 | Section 0 landmarks |
| Registrations | 4 | R-07…R-19 |
| Payments | 7 | $-01…$-23 |
| Refunds | 3 | $-30…$-36 |
| Accommodation | 4 | L-13…L-21 |
| Attendance | 2 | D-25, D-26 |
| Teams | 2 | `TEAM_FULL`, `TEAM_LOCKED` |
| Documents | 2 | L-01…L-08 |
| Certificates | 1 | E-08…E-10 |
| Audit | 2 | O-13…O-17 |
| Reconciliation | 2 | $-37…$-41 |
| Aggregates | 4 | O-02, O-32 |
| Participants | 3 | P-17, D-12 |

**Not covered by any automated test:** every screen, form, keyboard shortcut, redirect,
modal, export, empty state, tooltip and responsive breakpoint in this document. There is no
component, integration or E2E harness in the repo — sections 3 and 6–9 are manual only.

