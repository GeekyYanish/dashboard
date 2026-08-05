# Registration Console

An operations console for the registration team of a national inter-collegiate
fest — registrations, fee collection, payment verification, accommodation,
travel, on-ground desk and the reporting that closes the books afterwards.

Styled as a **precision instrument panel**: warm porcelain neumorphic surfaces,
engraved labels, tactile controls, in light and dark.

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # 39 assertions against the data layer, headless
```

Seeded with a deterministic dataset — **2,414 participants, 6,161
registrations, 1,939 payments, 65 colleges, 44 events** — frozen a week before
the fest, when the team is at peak load: the verification queue is deep,
hostels are half-allotted, documents are still arriving.

---

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
localStorage or a database. Today `MockRepository` implements it;
[`src/lib/data/index.ts`](src/lib/data/index.ts) is **the single construction
point** — swapping in a real backend is one line there plus a second
implementation.

Every repository method is `async` even though the mock store is synchronous.
That is deliberate: written against synchronous returns, swapping in a
network-backed implementation would mean touching every call site.

Failures throw `DataError` with a stable code (`UTR_ALREADY_USED`,
`REFUND_EXCEEDS_PAID`, `GENDER_MISMATCH`, …). Catch on `code`, never on message.

Data fetching goes through `useAsync`, whose `{ data, error, loading, reload }`
shape mirrors TanStack Query — so that swap is a hook rename, not a rewrite.

### Storage

The seeded dataset serialises to ~7 MB, comfortably over the localStorage
quota. So the store persists only **mutations**: the seed regenerates
deterministically on boot (same seed → same data) and a compacted overlay of
changed records replays on top. Writes survive a reload without ever hitting
the quota.

### Performance

Every derived figure is per-participant and the console asks for them 2,400 at
a time. Done naively that is a linear scan of 6,000 registrations per
participant — measured at ~1.8 s to paint the overview. `MockRepository` builds
indexes once per mutation (invalidated by a `version` counter bumped in the
single write path), which drops it to ~30 ms:

| Call | Before | After |
|---|---|---|
| `overview.stats` | 767 ms | 32 ms |
| `documents.completeness` | 792 ms | 6 ms |
| `payments.outstanding` | 391 ms | 13 ms |

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
- **Every mutation writes an audit event.** No silent writes.
- **Erasure anonymises identity but retains the money trail** — a privacy
  request cannot delete an audited financial record.

Each is asserted in the suite.

---

## Verification

```bash
npm test           # 39 assertions, headless, deterministic reseed → 39/39
npx tsc --noEmit   # clean
npm run lint       # 0 errors
npm run build      # 33 routes
```

Two dev-only routes (they 404 in production):

- **`/dev/kitchen-sink`** — every primitive in every state, both families side
  by side. This is the visual regression surface; check it in **both themes**
  after any change to the tokens or depth utilities in `globals.css`.
- **`/dev/data-test`** — the same 39 assertions in the browser, wiping and
  reseeding on each run. `npm test` and this page execute the same
  [`suite.ts`](src/frontend/screens/dev/suite.ts).

### End-to-end walkthrough

1. `/desk` — register a walk-in, collect ₹450 cash.
2. `/payments/drawer` — the cash appears in the open shift's expected total.
3. `/payments/queue` — verify a UPI payment (`A`); an invoice serial is issued
   and its registrations flip to confirmed.
4. `/accommodation` — auto-allot; unpaid or document-incomplete requests are
   refused with the specific reason.
5. `/checkin` — check the participant in; scan again and it reports "already
   checked in" rather than double-counting.
6. `/` — KPIs, funnel and activity feed have all moved.
7. `/audit` — every one of those steps is logged with actor and before/after.

### Reconciliation round-trip

Export the ledger from `/payments`, re-import it at `/payments/settlements` as
a bank statement, and confirm auto-match clears the worklists.

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
