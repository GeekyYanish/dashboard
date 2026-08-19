# Registration Console

An operations console for the registration team of a national inter-collegiate
fest — registrations, fee collection, payment verification, accommodation,
travel, on-ground desk and the reporting that closes the books afterwards.

Styled as a **precision instrument panel**: warm porcelain neumorphic surfaces,
engraved labels, tactile controls, in light and dark.

```bash
npm install
npm run dev      # http://localhost:3002
npm test         # 61 assertions against the data layer, headless
```

The console is **backend-backed by default** and talks only to its own
same-origin proxy, so it needs the API running. Start
[`gateways-backend`](../gateways-backend) first (`npm run dev`, port 4000), then
point the console at it in `.env.local`:

```bash
REGISTRATION_API_URL=http://127.0.0.1:4000      # server-only; never reaches the browser
NEXT_PUBLIC_WEBSITE_URL=http://localhost:3000   # where staff sign in
NEXT_PUBLIC_USE_API_BACKEND=true                # set "false" for the offline demo
```

With the backend down, every screen shows **"Registration service unavailable"** —
that is the proxy reporting it could not reach the API, not a console bug.

## Sign in

There are **no built-in accounts**, by design. The console has no login form of
its own: staff authenticate on the Gateways website and are handed across, and
the console never sees a password.

1. **Sign up on the website** (`NEXT_PUBLIC_WEBSITE_URL`) and verify the email.
   In development the verification code is printed to the backend's console as a
   `[DEV EMAIL LOG]` line — no SMTP required.
2. **Grant a staff role from the CLI** (see below).
3. **Open the console.** The session arrives over the handoff; unsigned-in
   visitors are sent to the website rather than shown a password box.

### Granting roles

Every account starts as **`PARTICIPANT`** — that row is inserted automatically on
signup (both password and Google sign-up), in the same transaction as the user
itself. It grants no console access. Staff roles are added on top of it, so a
console user normally holds two roles: `PARTICIPANT` plus whatever they were
granted.

Run from the **`gateways-backend`** directory, not this one:

```bash
cd ../gateways-backend
```

**Grant:**

```bash
npm run role:grant -- --email someone@example.com --role ADMIN       # Registration Head
npm run role:grant -- --email someone@example.com --role ORGANIZER   # Coordinator
npm run role:grant -- --email someone@example.com --role SCANNER     # Desk
```

**Revoke** — same command with `--revoke`:

```bash
npm run role:grant -- --email someone@example.com --role ADMIN --revoke
npm run role:grant -- --email someone@example.com --role ORGANIZER --revoke
npm run role:grant -- --email someone@example.com --role SCANNER --revoke
```

| Backend role | Console role | Typically | Granted by |
|---|---|---|---|
| `ADMIN` | Registration Head | core committee, faculty | CLI |
| `ORGANIZER` | Coordinator | event heads, volunteers | CLI or Staff screen |
| `SCANNER` | Desk | registration team | CLI or Staff screen |
| `PARTICIPANT` | — | everyone; no console access | automatic on signup |

Revoking `PARTICIPANT` is possible but pointless — it is the baseline role, not a
permission. To remove someone's console access, revoke the staff role and leave
`PARTICIPANT` alone.

Five things worth knowing:

- **The person must sign up first.** The script promotes an existing account and
  refuses an unknown email; it never creates users.
- **It is idempotent** — re-running prints `already has ADMIN; nothing to do`.
- **It refuses to revoke the last remaining `ADMIN`**, so the system cannot be
  locked out of its own role management.
- **Every grant and revoke writes an `audit_log` row** with actor `system:cli`.
- **CLI grants are unscoped, and for `ORGANIZER`/`SCANNER` that means they see
  nothing.** The script sets no `event_scope_id`. `getStaffContext` builds
  `organizerEventIds`/`scannerEventIds` only from assignments that *have* a
  scope, so an unscoped coordinator passes the "is staff" check, gets into the
  console, and then finds every list empty and every event-scoped action
  refused with *"You are not assigned to this event."* Only `ADMIN` is genuinely
  global, because `isAdmin` bypasses scoping entirely.

  **So: use the CLI for `ADMIN`, and grant `ORGANIZER`/`SCANNER` from the
  console's Staff screen**, which records the event alongside the role.

This is deliberately a CLI rather than a `BOOTSTRAP_ADMIN_EMAILS` environment
variable: an env var that re-promotes on every boot is a permanent, invisible
backdoor if it ever leaks or is mistyped. The CLI requires database credentials —
an existing trust boundary — and leaves an audit trail.

To target a deployed database, set `NODE_ENV` so the matching env file is picked
up:

```bash
NODE_ENV=preproduction npm run role:grant -- --email you@example.com --role ADMIN
```

### Offline demo mode

Setting `NEXT_PUBLIC_USE_API_BACKEND=false` swaps the whole data layer for the
seeded in-browser store, which does ship five role accounts and a **Reset demo
data** button. It needs no backend and no database.

> **Demo mode is not an authentication boundary.** Everything runs in the
> browser, so anyone with devtools can edit the stored session and make
> themselves Registration Head. Use it for UI work and demos only. The
> backend-backed path above is the real boundary: the session lives in an
> httpOnly cookie the browser's JavaScript cannot read, the bearer token is
> attached server-side by the proxy, and every role is re-derived from the
> database on each request.

## The data

Where a screen's data comes from depends on the module, not the mode. In
backend-backed mode `createHttpRepository()` overrides **10 of the 23**
repository modules; the rest still read the seeded in-browser store.

**Live against the API** — `auth` · `overview` · `participants` ·
`registrations` · `payments` · `events` · `teams` · `staff` · `audit` · `admin`

**Still demo data** — `refunds` · `settlements` · `coupons` · `colleges` ·
`documents` · `accommodation` · `travel` · `attendance` · `desk` · `comms` ·
`certificates` · `helpdesk` · `views`

> **This is the main gap between here and production.** A demo-backed screen
> renders confident, plausible numbers that exist nowhere but the browser —
> accommodation allotments, refund approvals and settlement matches all look
> real and persist nowhere. Before this console is used to run an actual fest,
> either the remaining modules need backends or those routes need hiding. Check
> [`http-repository.ts`](src/lib/data/http/http-repository.ts) for the current
> list; it is the single source of truth and this README will drift from it.

### The seeded store

Demo data comes from [`seed.ts`](src/lib/data/local/seed.ts): configuration a
real deployment needs on day one — 68 colleges, the 44-event catalogue, fee
rules, document requirements, hostel blocks — plus **one small worked example**
of 20 participants with registrations, payments, documents, accommodation and
travel, so no screen is blank.

Fixtures are dated relative to the fest, so the seeded state is always a genuine
pre-fest one. Attendance is near-zero on purpose: nobody checks in weeks early,
and faking it would make every downstream number lie.

The store persists only **mutations** — the seed regenerates deterministically
on boot and a compacted overlay of changed records replays on top.

### Real reference data

In backend mode the catalogue lives in the database, not in `seed.ts`. Populate
a fresh environment from the backend:

```bash
cd ../gateways-backend
npm run db:migrate    # schema; never db:push against a shared database
npm run db:seed       # event categories and the canonical event catalogue
```

Colleges and departments are reference data the seed does not recreate — carry
them across when moving environments.

## Why it looks like this

Two rules hold everywhere. They are written up in
[`src/frontend/components/neo/README.md`](src/frontend/components/neo/README.md)
and enforced by convention rather than tooling, so read them before adding UI.

### 1. The surface ladder

Neumorphism only reads correctly when an element's background equals its
parent's — a raised card inside a raised card produces mud. Four levels:

| Level | What | Used for |
|---|---|---|
| **L0** | Canvas, flat | Page background |
| **L1** | Raised / inset | Cards, KPI tiles, buttons, toggles, chart frames, sidebar |
| **L1c** | Content plane, flat | Table interiors, dense forms, list rows |
| **L2** | Floating, real shadow | Modals, drawers, popovers, the command palette |

**L1c is the pressure valve.** Full neumorphism on a 3,000-row table fails
twice: extruded surfaces stop separating from each other exactly when there are
most of them, and two shadow passes per row is real paint cost. So `NeoCard` is
raised and `NeoCard.Body` is flat. The frame still reads as soft-UI; the data
inside stays crisp and paints fast.

### 2. Colour is data

The chrome is monochrome graphite on porcelain. Hue is reserved for **status**.

A green pill always means money arrived — it never means "primary button".
Primary buttons are graphite. One signal-orange accent exists for the live
indicator, the active-nav marker, focus rings and the brand mark, and appears
nowhere else. That discipline is what keeps a screen carrying eleven status
colours readable.

Chart series come from a **validated categorical palette**, not hand-picked
hues: checked for lightness band, chroma floor, adjacent-pair colour-vision
separation (worst ΔE 9.1 light / 8.4 dark) and contrast against both plane
surfaces. Four light-mode slots sit under 3:1, so every chart using them also
ships a legend or direct labels — identity is never colour alone.

Affordance comes from **state**, not borders: hover lifts, active presses,
`:focus-visible` draws a real 2px ring in both themes. A soft shadow is not a
focus indicator.

---

## Architecture

```text
src/
├── app/                      routes only — thin pages, metadata, layouts
│   ├── (console)/            the modules, inside the shell
│   ├── desk/                 kiosk — own layout, no sidebar
│   ├── live/                 war-room wall display — own layout
│   └── dev/                  kitchen-sink + data-test (404 in production)
├── frontend/                 screens, components, hooks, design system
└── lib/                      fest config, utils, and the data layer
```

### The swap seam

Pages depend on the `Repository` interface
([`src/lib/data/repository.ts`](src/lib/data/repository.ts)), never on
localStorage or a database. **Both implementations now exist**, and
[`src/lib/data/index.ts`](src/lib/data/index.ts) is the single construction
point that picks between them:

```ts
cached = hasApiBackend() ? createHttpRepository() : new MockRepository();
```

`createHttpRepository()` spreads a `MockRepository` and overrides the modules
that are live against the API — auth, overview, audit, participants,
registrations, payments, events, teams, staff. Anything not yet overridden still
reads the seeded store, which is why a screen can be live while its neighbour is
still demo data. That seam is the thing to check first when a page shows
plausible-looking numbers that the backend does not have.

Every repository method is `async` even though the mock store is synchronous.
That is deliberate: written against synchronous returns, swapping in a
network-backed implementation would mean touching every call site.

Failures throw `DataError` with a stable code (`UTR_ALREADY_USED`,
`REFUND_EXCEEDS_PAID`, `GENDER_MISMATCH`, …). Catch on `code`, never on message.

Data fetching goes through `useAsync`, whose `{ data, error, loading, reload }`
shape mirrors TanStack Query — so that swap is a hook rename, not a rewrite.

### Auth

Three files, all in [`src/lib/auth/`](src/lib/auth/):

- **`permissions.ts`** — the seventeen-capability map, and the only place it is
  written down. `assertCan()` in the repository and `useCan()` in the UI both
  read it, so the settings matrix cannot drift from what is enforced.
- **`crypto.ts`** — PBKDF2-SHA256, 100k iterations, 16-byte per-user salt,
  constant-time compare. Isomorphic (Web Crypto exists in Node), which is how
  `npm test` exercises the real hashing path rather than a stub.
- **`session.ts`** — mint / read / expire, 12-hour TTL with sliding refresh, and
  cross-tab sync so signing out in one tab does not leave another authenticated.
  Falls back to memory when localStorage is unavailable.

Those three files are the **demo-mode** implementation. In backend-backed mode
the session is server-held and the console never touches a password:

- **The session cookie is httpOnly.** `registration_console_session` is set by
  [`/api/auth/login`](src/app/api/auth/login/route.ts) and is unreadable from
  browser JavaScript.
- **The proxy attaches the bearer token.** Every `/api/v1/*` call goes to the
  console's own origin ([`[...path]/route.ts`](src/app/api/v1/[...path]/route.ts)),
  which reads that cookie server-side and forwards `Authorization: Bearer …`.
  The backend origin is never exposed to the browser, so there is no CORS
  surface and no token in bundled code.
- **Roles are re-derived per request** from `user_roles` on the backend; the
  console's copy is display state only.
- **A 401 or 403 clears the cookie** on the way back through the proxy, so an
  expired session cannot linger client-side.

Route guards remain a client component
([`auth-gate.tsx`](src/frontend/components/shell/auth-gate.tsx)). It decides what
to *render*; it is not the access boundary — the backend is, and it refuses
unauthorised calls regardless of what the console draws.

A transient backend outage is deliberately **not** treated as a sign-out: a
`STORAGE_UNAVAILABLE` error leaves the current session in place instead of
ejecting the operator mid-shift.

### Storage

The store persists only **mutations**: the seed regenerates deterministically on
boot (same seed → same data) and a compacted overlay of changed records replays
on top. That design was forced by the original 7 MB dataset overrunning the
localStorage quota; it is kept because it also makes "reset to a known state" a
single delete.

### Performance

Left over from when the fixtures were 2,414 participants and 6,161
registrations. Every derived figure is per-participant, and computing them
naively meant a linear scan of every registration *per person* — measured at
~1.8 s to paint the overview. `MockRepository` builds indexes once per mutation,
invalidated by a `version` counter bumped in the single write path:

| Call | Before | After |
|---|---|---|
| `overview.stats` | 767 ms | 32 ms |
| `documents.completeness` | 792 ms | 6 ms |
| `payments.outstanding` | 391 ms | 13 ms |

The indexes are worth keeping at any size, and they are what lets the dataset
grow back toward real numbers without the console slowing down.

---

## Modules

**Intake** — Registrations (faceted table, saved views, bulk actions, 360°
drawer, CSV import with a mandatory dry run, duplicate merge, schedule-clash
detection, waitlist) · Participants · Colleges & contingents · Teams &
substitutions · Events & capacity.

**Money** — Ledger · keyboard-driven verification queue with SLA ageing ·
outstanding dues by age bucket · refunds (request → approve → pay) · **bank
reconciliation** with auto-match and two worklists · fraud lane · cash drawer
per desk shift.

**Logistics** — Document verification with hard gates on badges and beds ·
gender-segregated accommodation with occupancy, hostel check-in and meal
coupons · travel with station pickup scheduling.

**Event day** — the on-spot **desk** (walk-in registration, payment collection,
badge printing, kit issue, queue tokens, offline-tolerant write queue) ·
check-in with no-show reallocation · the **war room** wall display.

**Engage** — Communications (templates, audience builder, delivery log) ·
Certificates gated on attendance with public verification tokens · Helpdesk.

**Operate** — Reports incl. final settlement · team roster and desk coverage ·
immutable audit log · settings with a real permission matrix.

---

## Live against the backend

### Audit log

`/audit` reads the backend's `audit_log` table rather than seeded fixtures.
Entries are written inside the same transaction as the change they describe, so
an audited action cannot be recorded without having happened.

- **Keyset-paginated** on the uuidv7 primary key — time-ordered, so paging never
  skips or repeats a row as new entries arrive.
- **Scoped by role.** `ADMIN` sees everything; `ORGANIZER` sees only entries for
  events they organise. A non-staff session gets an empty log, not an error.
- Entries created before event scoping shipped have no `event_id` and are
  therefore ADMIN-only — organiser history starts from that deploy, not
  retroactively.
- The dashboard's **Recent activity** card reads the same source, so it can no
  longer disagree with the full log.

### Payment receipts

The verification queue renders the uploaded receipt inline — PDFs in an
`<iframe>` (the browser's own viewer, no PDF library), images in an `<img>`.

Receipt bytes are streamed **through the backend** rather than linked directly
from object storage: the stored file is served with
`Content-Disposition: attachment`, which every browser downloads instead of
displaying, and the signed storage URL expires within minutes. Fetching a
receipt is itself audited as `payment_receipt_viewed` — who opened which
participant's document is part of the trail.

---

## Business rules that are actually enforced

Not UI-level hints — these live in the repository and throw:

- **A UTR can be claimed once.** The single most common fee fraud at a fest.
- **A payment's breakdown must sum to its amount**, or disputes start later.
- **Verification is idempotent** — a double-click cannot mint a second invoice.
- **A refund cannot exceed what was collected**, net of refunds already issued.
- **Only the Registration Head approves refunds** (a Finance Verifier gets
  `FORBIDDEN`).
- **Cancelling a live seat promotes the earliest waitlister.**
- **A bed is refused** on unpaid dues, missing hostel documents, a gender/block
  mismatch, or a full room.
- **Under-18s require guardian consent** before a badge or a bed.
- **Check-in is idempotent** — the gate volunteer will scan the same badge twice.
- **You cannot certify someone who never turned up.**
- **Every mutation writes an audit event**, attributed to the signed-in account.
  No silent writes, no anonymous ones.
- **Erasure anonymises identity but retains the money trail** — a privacy
  request cannot delete an audited financial record.

And on access:

- **Every mutation requires a session.** No session, `NOT_AUTHENTICATED`.
- **Seventeen capabilities, enforced.** The matrix in Settings is *rendered from
  the same map* the repository checks, so it cannot drift out of step with what
  actually happens.
- **Authorisation runs before validation.** Gates are the first statement of
  every method — checking the id first would both skip the gate on a bad id and
  leak whether a record exists.
- **Five failed sign-ins lock an account** for a minute.

Each is asserted in the suite.

### What each role can actually do

The five-role matrix below is the **demo-mode** capability map. The backend has
four roles (`ADMIN`, `ORGANIZER`, `SCANNER`, `PARTICIPANT`), which the console
maps to Head / Coordinator / Desk / no-access — so Finance and Viewer have no
backend equivalent and exist only in the seeded store.

Verified by signing in as all five and attempting every action:

| | register | verify | refund | reconcile | docs | allot | check-in | roles | erase |
|---|---|---|---|---|---|---|---|---|---|
| **Head** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Coordinator** | ✓ | ✓ | — | — | ✓ | ✓ | ✓ | — | — |
| **Finance** | — | ✓ | — | ✓ | — | — | — | — | — |
| **Desk** | ✓ | — | — | — | — | — | ✓ | — | — |
| **Viewer** | — | — | — | — | — | — | — | — | — |

Every role can *read* the whole console; only mutations are gated.

---

## Verification

```bash
npm test           # 61/61 assertions, headless, deterministic reseed
npx tsc --noEmit   # clean
npm run lint       # 0 errors, 29 warnings
npm run build      # 42 routes, 44 static pages
```

The suite exercises the **demo repository**, not the API: it reseeds
deterministically and asserts business rules and all seventeen permissions
without a network or a database. That makes it fast and reliable, and means a
green run says nothing about whether the backend is up — check the live path
separately.

Backend tests live in [`gateways-backend`](../gateways-backend) (`npm test`) and
do hit a real database.

Two dev-only routes (they 404 in production):

- **`/dev/kitchen-sink`** — every primitive in every state, both families side
  by side. This is the visual regression surface; check it in **both themes**
  after any change to the tokens or depth utilities in `globals.css`.
- **`/dev/data-test`** — the same 61 assertions in the browser, wiping and
  reseeding on each run. `npm test` and this page execute the same
  [`suite.ts`](src/frontend/screens/dev/suite.ts).

### Prove the permissions are real

In **demo mode**, sign in as **Viewer** and try to verify a payment. You get a
specific refusal — *"Your role cannot do this — payments.verify requires
Registration Head or Coordinator or Finance Verifier"* — thrown by the
repository, not the UI. Then sign in as **Finance**: verifying works, approving
a refund does not. The suite asserts that asymmetry in both directions for all
seventeen capabilities.

In **backend mode** the real check is server-side, and the honest way to prove it
is to bypass the console entirely:

```bash
curl -s http://127.0.0.1:4000/api/v1/admin/payments   # 401 without a session
```

Every admin route calls its own guard in the handler — the `/admin` prefix is
organisational, not a gate — and roles are re-read from `user_roles` per request,
so revoking a role takes effect on the next call rather than the next login.

### End-to-end walkthrough (backend-backed)

1. Start the backend (`npm run dev`, port 4000) and the console (port 3002).
2. Sign up on the website, verify with the code from the backend's
   `[DEV EMAIL LOG]` line.
3. `npm run role:grant -- --email you@example.com --role ADMIN` from
   `gateways-backend`.
4. Open the console — the session arrives over the website handoff.
5. `/payments/queue` — a submitted receipt renders inline; verify it (`A`) and
   the participant's registrations flip to confirmed.
6. `/audit` — the review appears as `payment_receipt_reviewed`, attributed to
   **your account**, alongside a `payment_receipt_viewed` row for opening the
   receipt.
7. Revoke your own role with `--revoke` and reload: admin calls start returning
   403 without signing out.

### Demo-mode walkthrough

Requires `NEXT_PUBLIC_USE_API_BACKEND=false`; the accounts below exist only in
the seeded store.

1. `/login` — sign in as the Desk Volunteer, set a password.
2. `/desk` — register a walk-in, collect ₹450 cash.
3. `/payments/drawer` — the cash appears in the open shift's expected total.
4. Sign in as **Finance**, verify a UPI payment in `/payments/queue`.
5. Try `/payments/refunds` → Approve. It refuses: only the Head can.
6. `/accommodation` — auto-allot; unpaid or document-incomplete requests are
   refused with the specific reason.
7. Export the ledger from `/payments`, re-import it at `/payments/settlements`
   as a bank statement, and confirm auto-match clears the worklists.

Steps 3, 5, 6 and 7 exercise modules that are **demo-only** — they do not touch
the backend in either mode.

---

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 (CSS-first — every
token lives in `@theme` in `globals.css`, there is no `tailwind.config.ts`) ·
Radix primitives for focus-trapping, fully reskinned · sonner for toasts ·
**hand-rolled SVG charts** (a chart library would fight the surface ladder and
double the theming work).

## Renaming the fest

One file: [`src/lib/fest.config.ts`](src/lib/fest.config.ts). Name, dates,
categories, tracks, fee rules, document requirements, hostel blocks, staff
roles and serial prefixes. Nothing else hardcodes them.
