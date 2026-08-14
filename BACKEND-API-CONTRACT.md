# Backend API contract — Registration Console ↔ Gateways frontend ↔ backend

Status: **draft, for the backend team to implement against.** This is the seam between
three codebases:

- **Gateways** (`Parallax`) — the public site. Participants sign up and register for
  events here.
- **Registration Console** — the ops dashboard. Staff verify payments, correct
  participant details, and manage registration status here.
- **Backend** — a separate service (Node/Express or Fastify), owned by the backend
  team, sitting in front of one shared database.

Neither frontend talks to the other directly. Both talk to this API. A registration
created on Gateways becomes visible in the Console the moment the Console reads it back
from the same rows; a status/payment/detail change made in the Console is visible to
Gateways the same way. No shared localStorage, no direct DB access from either frontend.

This doc exists so the backend can be built independently of both frontends, matching
the pattern both already use internally (`Repository` interface + one construction
point) — see `src/lib/data/repository.ts` in Console and `src/backend/data/repository.ts`
in Gateways.

---

## 1. Why the two apps don't already agree on a shape

Gateways' current data model is minimal — it wasn't built to carry ops data:

| Gateways has (`src/backend/data/types.ts`) | Console needs (`src/lib/data/types.ts`) that Gateways doesn't have |
|---|---|
| `Profile`: email, fullName, phone | gender, dateOfBirth, category, tshirtSize, dietaryPref |
| `Character`: collegeId, departmentId, yearOfStudy | emergencyName, emergencyPhone |
| `Registration`: eventId, userId, teamId, status | code (badge code), feeInr, waitlistPosition, cancelReason, source |
| One-time "registration fee" verified via `PaymentReceipt`, decoupled from per-event registration | `Payment.breakdown` (line items), `Payment.registrationIds` (one payment can settle many event registrations) |

**Action for the Gateways frontend team:** the registration/onboarding form needs new
fields — gender, date of birth, category, T-shirt size, dietary preference, emergency
contact name + phone — none of which exist in the current character-creation flow.
Without them, `POST /v1/registrations` below cannot be satisfied and Console's Intake
and Money modules will show incomplete records.

---

## 1a. Identity mapping

Gateways is the identity provider — participants sign in there via Auth.js, not in
Console. So the backend's canonical `Participant.id` **is** the Gateways `users.id`
(the same UUID Auth.js already assigns). Console never mints its own participant IDs
once the backend is live; `GET/PATCH /v1/participants/:id` takes that same UUID.

`Registration.id`, by contrast, is assigned by the backend on `POST /v1/registrations`
and returned in the response — both frontends store and reference that id afterward.
There is no separate Gateways-side registration id to reconcile.

## 2. Auth

Two different callers hit this API and must be told apart:

- **Participant calls** (from Gateways, on behalf of a signed-in user) — send the
  participant's existing Auth.js session token. The backend resolves it to a `userId`.
- **Staff calls** (from Console) — send a bearer token issued to the Console's own
  staff session. The backend resolves it to a `staffId` + role, and checks it against
  the same permission set Console already enforces client-side in
  `src/lib/auth/permissions.ts` (17 capabilities) — **enforce it again server-side**;
  Console's own docs are explicit that its current permission checks are UI-only and
  must not be trusted as the real boundary once a backend exists.

Every mutating endpoint below records who called it (`staffId` or `userId`) for the
Console's audit trail.

## 3. Error shape

```json
{ "error": { "code": "UTR_ALREADY_USED", "message": "This UTR has already been used for another payment." } }
```

`code` must be one of Console's existing `DataErrorCode` values (`src/lib/data/types.ts`)
wherever the situation matches one — both frontends already have `catch` blocks that
switch on `.code`, not on message text:

`NOT_AUTHENTICATED, INVALID_CREDENTIALS, NOT_FOUND, VALIDATION_FAILED, ALREADY_REGISTERED,
EVENT_FULL, REGISTRATION_CLOSED, TEAM_FULL, TEAM_LOCKED, UTR_ALREADY_USED, AMOUNT_MISMATCH,
ALREADY_VERIFIED, REFUND_EXCEEDS_PAID, PAYMENT_NOT_VERIFIED, DOCS_INCOMPLETE,
GENDER_MISMATCH, DUPLICATE_PARTICIPANT, FORBIDDEN`

HTTP status is secondary to `code` — map `NOT_FOUND`→404, `FORBIDDEN`/`NOT_AUTHENTICATED`→
403/401, `VALIDATION_FAILED`→422, everything else conflict-shaped → 409, but both
frontends read `error.code`, not the status number.

## 4. Polling, not push

Neither app has realtime infrastructure yet (Gateways' own `DECISIONS.md` settled on
15s polling for announcements for the same reason — MySQL has no `LISTEN/NOTIFY`).
Every list endpoint below accepts `updatedSince` (ISO timestamp) so the Console can poll
for what changed instead of re-fetching everything. 15s is the suggested interval,
matching the existing precedent.

---

## 5. Endpoints — v1

### Registrations

```
POST /v1/registrations                    (participant call)
  body: { eventId, teamId?,
          participant: { fullName, email, phone, gender, dateOfBirth, collegeId,
                          department, yearOfStudy, category, tshirtSize,
                          emergencyName, emergencyPhone, dietaryPref } }
  → creates the Participant if new (matched on email), then the Registration.
    source is always "online".
  errors: ALREADY_REGISTERED, EVENT_FULL, REGISTRATION_CLOSED, VALIDATION_FAILED,
          GENDER_MISMATCH, DUPLICATE_PARTICIPANT

GET /v1/registrations?updatedSince=&status=&eventId=&collegeId=   (staff call)
  → Registration[], for the Console's list views and polling.

GET /v1/registrations/:id                 (either)

PATCH /v1/registrations/:id/status        (staff call)
  body: { status: "confirmed"|"waitlisted"|"cancelled"|"rejected", reason? }
  → cancelling a confirmed seat promotes the earliest waitlister (same rule as
    Console's local `cancel()` today) and returns { cancelled, promoted }.
```

### Participants

```
GET /v1/participants?updatedSince=&search=       (staff call)
GET /v1/participants/:id                          (either)
PATCH /v1/participants/:id                        (staff call)
  body: Partial<Participant> — staff correcting a name/college/T-shirt/etc.
  → this is the "changes on the dashboard are visible on the frontend" path for
    profile data: writes to the same row Gateways reads for that user's profile.
```

### Payments

```
POST /v1/payments                          (participant or staff/desk call)
  body: { participantId, registrationIds, method, utr?, amount, breakdown,
          receiptData?, receiptFileName? }
  errors: UTR_ALREADY_USED, AMOUNT_MISMATCH

GET /v1/payments?updatedSince=&status=     (staff call)
GET /v1/payments/:id

PATCH /v1/payments/:id/review              (staff call)
  body: { decision: "verified"|"rejected"|"resubmit", note? }
  → idempotent: re-verifying an already-verified payment returns it unchanged
    (ALREADY_VERIFIED is informational, not necessarily an error — match Console's
    current `review()` semantics in `mock-repository.ts`).
```

---

## 6. What's explicitly out of scope for v1

Everything else in Console's `Repository` interface — accommodation, travel, desk
shifts, comms, certificates, helpdesk, staff management, CSV import, refunds,
settlements, coupons, fraud sweep, duplicate-merge, DPDP export/erase — stays on
Console's local mock data for now. Wiring those to the backend is a later phase; this
contract only covers the path the frontend registration flow actually needs today:
submit → appears in Console → Console edits reflect back.

---

## 7. Env vars each frontend needs once the backend is live

- Gateways: `PARALLAX_API_BASE_URL`
- Registration Console: `NEXT_PUBLIC_REGISTRATION_API_URL`, `REGISTRATION_API_STAFF_TOKEN`
  (or however the staff-auth handoff ends up working — placeholder until the backend
  team confirms the auth mechanism in §2)

Until these are set, both apps keep working exactly as today, against their local mock
data — see the `HttpRepository` wiring in Console's `src/lib/data/index.ts`.
