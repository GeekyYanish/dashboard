/**
 * Domain types.
 *
 * Shapes deliberately mirror the eventual SQL columns one-to-one, so swapping
 * the mock repository for a real backend is a rename rather than a rewrite.
 * Timestamps are ISO-8601 strings, not Date objects — they round-trip through
 * JSON.stringify losslessly, which a Date does not.
 *
 * The identity/registration/event/team/attendance shapes are kept
 * wire-compatible with the PARALLAX fest portal (`Gateways/src/backend/data/
 * types.ts`) so the two systems can eventually share a database.
 */

import type { CategoryId, DocTypeId, PaymentMethodId, StaffRoleId, TrackId } from "../fest.config";

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------

export interface College {
  id: string;
  name: string;
  shortName: string;
  city: string;
  state: string;
  /** Verified = the institution letter has been checked by the desk. */
  isVerified: boolean;
  /** Contingent leader — the student the desk actually calls. */
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  facultyEscortName: string | null;
  facultyEscortPhone: string | null;
}

export interface FestEvent {
  id: string;
  slug: string;
  title: string;
  track: TrackId;
  /** Solo events have min=max=1. */
  minTeamSize: number;
  maxTeamSize: number;
  /** null = unlimited. */
  capacity: number | null;
  feeInr: number;
  venue: string;
  /** Which fest day, keyed to FEST.days. */
  day: string;
  startsAt: string;
  endsAt: string;
  registrationClosesAt: string;
  /** Sports/adventure events require the indemnity waiver. */
  requiresIndemnity: boolean;
  status: "draft" | "published" | "registration_closed" | "ongoing" | "completed" | "cancelled";
  coordinatorName: string;
  coordinatorPhone: string;
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export type Gender = "male" | "female" | "other";

export interface Participant {
  id: string;
  /** Human-facing code printed on the badge, e.g. AUR26-01847. */
  code: string;
  fullName: string;
  email: string;
  phone: string;
  gender: Gender;
  dateOfBirth: string;
  collegeId: string;
  department: string;
  yearOfStudy: number;
  category: CategoryId;
  tshirtSize: "XS" | "S" | "M" | "L" | "XL" | "XXL";
  /** Emergency contact — a hard requirement for a national event. */
  emergencyName: string;
  emergencyPhone: string;
  dietaryPref: "veg" | "non_veg" | "vegan" | "jain";
  notes: string | null;
  createdAt: string;
  createdVia: "online" | "on_spot" | "csv_import";
  isBlocked: boolean;
}

/** Derived, never stored: under-18 on the fest start date needs guardian consent. */
export interface ParticipantFlags {
  isMinor: boolean;
  docsComplete: boolean;
  missingDocs: DocTypeId[];
  amountDue: number;
  amountPaid: number;
}

// ---------------------------------------------------------------------------
// Registrations
// ---------------------------------------------------------------------------

export type RegistrationStatus =
  | "draft"
  | "pending"
  | "confirmed"
  | "waitlisted"
  | "cancelled"
  | "rejected";

export interface Registration {
  id: string;
  code: string;
  participantId: string;
  eventId: string;
  teamId: string | null;
  status: RegistrationStatus;
  /** Position in the waitlist queue; null unless status === "waitlisted". */
  waitlistPosition: number | null;
  feeInr: number;
  registeredAt: string;
  confirmedAt: string | null;
  cancelledAt: string | null;
  /** Reason codes, not free text — they get reported on. */
  cancelReason: string | null;
  source: "online" | "on_spot" | "csv_import";
  notes: string | null;
}

export interface Team {
  id: string;
  eventId: string;
  name: string;
  joinCode: string;
  leaderParticipantId: string;
  memberIds: string[];
  isLocked: boolean;
  createdAt: string;
}

/** Roster changes need a paper trail — teams swap members right up to the gate. */
export interface SubstitutionRequest {
  id: string;
  teamId: string;
  outParticipantId: string;
  inParticipantId: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  requestedAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

export type PaymentStatus = "pending" | "verified" | "rejected" | "refunded" | "partial";

export interface FeeLine {
  label: string;
  /** e.g. "base", "event", "accommodation", "surcharge", "discount" */
  kind: string;
  refId: string | null;
  amount: number;
}

export interface Payment {
  id: string;
  /** Invoice serial, assigned on verification. Sequential, gap-free. */
  invoiceSerial: string | null;
  participantId: string;
  /** Registrations this payment settles. A participant pays once for many events. */
  registrationIds: string[];
  method: PaymentMethodId;
  /** Bank/UPI reference. UNIQUE across the system — see DataError UTR_ALREADY_USED. */
  utr: string | null;
  amount: number;
  /** Must sum to `amount`. Asserted by the repository. */
  breakdown: FeeLine[];
  status: PaymentStatus;
  /** Base64 data URL of the uploaded receipt, or null for cash. */
  receiptData: string | null;
  receiptFileName: string | null;
  /** Cheap content hash — catches the same screenshot submitted twice. */
  receiptHash: string | null;
  submittedAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  /** Set when collected at the desk, links to the shift's cash drawer. */
  deskShiftId: string | null;
  /** Populated by the fraud sweep — surfaced as a review lane. */
  fraudFlags: FraudFlag[];
}

export type FraudFlagKind =
  | "duplicate_utr"
  | "duplicate_receipt"
  | "amount_mismatch"
  | "paid_before_registration"
  | "round_trip_refund";

export interface FraudFlag {
  kind: FraudFlagKind;
  detail: string;
  severity: "warn" | "block";
}

export interface Refund {
  id: string;
  serial: string;
  paymentId: string;
  participantId: string;
  amount: number;
  reasonCode: "event_cancelled" | "withdrawal" | "duplicate_payment" | "overcharge" | "other";
  reasonNote: string | null;
  status: "requested" | "approved" | "paid" | "rejected";
  requestedBy: string;
  requestedAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  /** UTR of the outgoing transfer. */
  payoutRef: string | null;
}

/** A line from an imported bank statement, for reconciliation. */
export interface Settlement {
  id: string;
  bankRef: string;
  amount: number;
  valueDate: string;
  narration: string;
  /** Auto-matched payment, or null if it needs a human. */
  matchedPaymentId: string | null;
  matchConfidence: "exact" | "probable" | "none";
  importedAt: string;
}

export interface Coupon {
  id: string;
  code: string;
  kind: "percent" | "flat";
  value: number;
  maxUses: number;
  usedCount: number;
  expiresAt: string | null;
  isActive: boolean;
  appliesTo: "all" | CategoryId;
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export interface DocumentSubmission {
  id: string;
  participantId: string;
  docType: DocTypeId;
  fileName: string;
  fileData: string | null;
  status: "pending" | "approved" | "rejected" | "resubmit";
  submittedAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
}

// ---------------------------------------------------------------------------
// Accommodation
// ---------------------------------------------------------------------------

export interface AccommodationRequest {
  id: string;
  participantId: string;
  /** Which fest-day keys they need a bed for. */
  nights: string[];
  gender: Gender;
  specialNeeds: string | null;
  status: "requested" | "allotted" | "checked_in" | "checked_out" | "cancelled";
  requestedAt: string;
  amount: number;
}

export interface RoomAllotment {
  id: string;
  requestId: string;
  participantId: string;
  blockId: string;
  roomNo: string;
  bedNo: number;
  allottedBy: string;
  allottedAt: string;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  /** Physical items issued at check-in, returned at check-out. */
  keyIssued: boolean;
  beddingIssued: boolean;
  itemsReturned: boolean;
}

export interface MealCoupon {
  id: string;
  participantId: string;
  day: string;
  meal: string;
  issuedAt: string;
  redeemedAt: string | null;
}

// ---------------------------------------------------------------------------
// Travel
// ---------------------------------------------------------------------------

export interface TravelRecord {
  id: string;
  participantId: string;
  direction: "arrival" | "departure";
  mode: "train" | "flight" | "bus" | "own";
  /** Train no. / flight no. — free text for bus and own transport. */
  serviceRef: string | null;
  station: string;
  scheduledAt: string;
  /** Assigned pickup slot; null when the participant arranges their own. */
  pickupSlotId: string | null;
  needsPickup: boolean;
  status: "expected" | "arrived" | "picked_up" | "no_show" | "departed";
}

export interface PickupSlot {
  id: string;
  station: string;
  windowStart: string;
  windowEnd: string;
  vehicle: string;
  capacity: number;
  driverName: string;
  driverPhone: string;
  volunteerStaffId: string | null;
  status: "planned" | "dispatched" | "completed";
}

// ---------------------------------------------------------------------------
// On-ground
// ---------------------------------------------------------------------------

export interface Attendance {
  id: string;
  participantId: string;
  /** null = venue gate check-in rather than a specific event. */
  eventId: string | null;
  registrationId: string | null;
  method: "qr" | "manual" | "self";
  checkedInAt: string;
  scannedBy: string | null;
  day: string;
}

export interface KitIssue {
  id: string;
  participantId: string;
  tshirtSize: string;
  items: string[];
  issuedAt: string;
  issuedBy: string;
  signature: boolean;
}

export interface DeskShift {
  id: string;
  staffId: string;
  deskName: string;
  day: string;
  startsAt: string;
  endsAt: string;
  status: "scheduled" | "open" | "closed";
  /** Cash drawer reconciliation. */
  openingFloat: number;
  expectedCash: number;
  countedCash: number | null;
  handoverTo: string | null;
  closedAt: string | null;
}

export interface QueueToken {
  id: string;
  number: number;
  deskName: string;
  issuedAt: string;
  servedAt: string | null;
  purpose: "walk_in" | "payment" | "query" | "kit";
}

// ---------------------------------------------------------------------------
// Communication
// ---------------------------------------------------------------------------

export interface MessageTemplate {
  id: string;
  name: string;
  channel: "email" | "sms" | "whatsapp";
  subject: string | null;
  body: string;
  /** Merge fields the body references, e.g. ["fullName", "amountDue"]. */
  mergeFields: string[];
  updatedAt: string;
}

export interface Broadcast {
  id: string;
  templateId: string;
  name: string;
  /** Serialised audience filter — the same shape the registrations page uses. */
  audience: Record<string, unknown>;
  audienceCount: number;
  channel: "email" | "sms" | "whatsapp";
  status: "draft" | "scheduled" | "sending" | "sent" | "failed";
  scheduledAt: string | null;
  sentAt: string | null;
  sentCount: number;
  failedCount: number;
  createdBy: string;
}

export interface MessageLog {
  id: string;
  broadcastId: string | null;
  participantId: string;
  channel: "email" | "sms" | "whatsapp";
  subject: string | null;
  status: "queued" | "sent" | "delivered" | "bounced" | "failed";
  sentAt: string;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Certificates & helpdesk
// ---------------------------------------------------------------------------

export interface CertificateIssue {
  id: string;
  serial: string;
  participantId: string;
  eventId: string | null;
  kind: "participation" | "winner" | "runner_up" | "special" | "volunteer";
  issuedAt: string;
  issuedBy: string;
  revokedAt: string | null;
  /** Public verification path — /verify/<serial>. */
  verifyToken: string;
}

export interface HelpdeskTicket {
  id: string;
  code: string;
  participantId: string | null;
  category:
    | "name_correction"
    | "wrong_event"
    | "lost_badge"
    | "payment_not_reflected"
    | "accommodation"
    | "travel"
    | "other";
  subject: string;
  body: string;
  priority: "low" | "normal" | "high" | "urgent";
  status: "open" | "in_progress" | "waiting" | "resolved" | "closed";
  assignedTo: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  resolutionNote: string | null;
}

// ---------------------------------------------------------------------------
// Staff, audit, saved views
// ---------------------------------------------------------------------------

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: StaffRoleId;
  isActive: boolean;
  joinedAt: string;
}

export interface AuditEvent {
  id: string;
  actorId: string;
  actorName: string;
  action: string;
  entity: string;
  entityId: string;
  /** Only the fields that changed, before → after. */
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  at: string;
  note: string | null;
}

export interface SavedView {
  id: string;
  name: string;
  scope: "registrations" | "payments" | "participants";
  filters: Record<string, unknown>;
  createdBy: string;
  isShared: boolean;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  severity: "info" | "success" | "warning" | "critical";
  publishedAt: string;
  expiresAt: string | null;
  createdBy: string;
}

// ---------------------------------------------------------------------------
// Aggregates the dashboard reads
// ---------------------------------------------------------------------------

export interface EventStats {
  eventId: string;
  confirmedCount: number;
  pendingCount: number;
  waitlistCount: number;
  checkedInCount: number;
  capacity: number | null;
  seatsLeft: number | null;
  revenue: number;
}

export interface OverviewStats {
  totalRegistrations: number;
  confirmed: number;
  pending: number;
  waitlisted: number;
  cancelled: number;
  participants: number;
  collegesOnboarded: number;
  revenueCollected: number;
  revenueExpected: number;
  outstandingDues: number;
  verificationQueueDepth: number;
  /** Oldest unverified payment, in hours. Drives the SLA badge. */
  oldestPendingHours: number;
  accommodationRequested: number;
  accommodationAllotted: number;
  accommodationCapacity: number;
  checkedInToday: number;
  docsPending: number;
  openTickets: number;
  /** Funnel counts, in order. */
  funnel: { stage: string; count: number }[];
  /** 30-day series for the sparklines and the area chart. */
  series: { date: string; registrations: number; revenue: number; confirmed: number }[];
  revenueByMethod: { method: string; amount: number; count: number }[];
  registrationsByTrack: { track: string; count: number }[];
  topColleges: { collegeId: string; name: string; count: number; paid: number; due: number }[];
}

export interface AttentionItem {
  id: string;
  kind: "payment_aging" | "over_capacity" | "docs_missing" | "unallotted" | "team_incomplete" | "fraud";
  severity: "warning" | "critical";
  title: string;
  detail: string;
  href: string;
  count: number;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type DataErrorCode =
  | "NOT_FOUND"
  | "VALIDATION_FAILED"
  | "ALREADY_REGISTERED"
  | "EVENT_FULL"
  | "REGISTRATION_CLOSED"
  | "TEAM_FULL"
  | "TEAM_LOCKED"
  | "UTR_ALREADY_USED"
  | "AMOUNT_MISMATCH"
  | "ALREADY_VERIFIED"
  | "REFUND_EXCEEDS_PAID"
  | "PAYMENT_NOT_VERIFIED"
  | "DOCS_INCOMPLETE"
  | "GENDER_MISMATCH"
  | "ROOM_FULL"
  | "ALREADY_CHECKED_IN"
  | "DUPLICATE_PARTICIPANT"
  | "STORAGE_UNAVAILABLE"
  | "FORBIDDEN";

export class DataError extends Error {
  readonly code: DataErrorCode;
  readonly detail?: string;

  constructor(code: DataErrorCode, message?: string, detail?: string) {
    super(message ?? code);
    this.name = "DataError";
    this.code = code;
    this.detail = detail;
  }
}

/** Narrowing helper so call sites switch on `code`, never on message text. */
export function isDataError(e: unknown): e is DataError {
  return e instanceof DataError;
}
