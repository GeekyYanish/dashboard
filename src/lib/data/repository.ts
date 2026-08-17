/**
 * THE SWAP SEAM.
 *
 * Pages and hooks depend on this interface, never on localStorage or on a
 * database directly. Today `MockRepository` implements it; later a
 * `HttpRepository` or `SqlRepository` will, and `./index.ts` changes by one
 * line.
 *
 * Every method is async even though the mock store is synchronous. That is
 * deliberate: if call sites were written against synchronous returns, swapping
 * in a network-backed implementation would mean touching every one of them.
 *
 * Methods throw `DataError` with a stable code on failure, matching what the
 * eventual server action returns. Catch on `code`, never on message.
 */

import type { StaffRoleId } from "../fest.config";
import type { Session } from "../auth/session";
import type {
  AccommodationRequest,
  Announcement,
  AttentionItem,
  Attendance,
  AuditEvent,
  Broadcast,
  CertificateIssue,
  College,
  Coupon,
  DeskShift,
  DocumentSubmission,
  EventStats,
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
} from "./types";

export interface Repository {
  auth: AuthRepo;
  overview: OverviewRepo;
  participants: ParticipantRepo;
  registrations: RegistrationRepo;
  payments: PaymentRepo;
  refunds: RefundRepo;
  settlements: SettlementRepo;
  coupons: CouponRepo;
  colleges: CollegeRepo;
  events: EventRepo;
  teams: TeamRepo;
  documents: DocumentRepo;
  accommodation: AccommodationRepo;
  travel: TravelRepo;
  attendance: AttendanceRepo;
  desk: DeskRepo;
  comms: CommsRepo;
  certificates: CertificateRepo;
  helpdesk: HelpdeskRepo;
  staff: StaffRepo;
  audit: AuditRepo;
  views: SavedViewRepo;
  admin: AdminRepo;
}

/** Who is acting. Derived from the signed-in session — never settable. */
export interface Actor {
  id: string;
  name: string;
  role: StaffRoleId;
}

export type Unsubscribe = () => void;

/**
 * Authentication.
 *
 * The contract is shaped so a server implementation is a drop-in: `signIn`
 * would set an httpOnly cookie instead of writing localStorage, and `session()`
 * would read it back. No screen code changes.
 *
 * See src/lib/auth/session.ts for why the current implementation is not a
 * security boundary.
 */
export interface AuthRepo {
  /** Throws INVALID_CREDENTIALS, ACCOUNT_DISABLED or ACCOUNT_LOCKED. */
  signIn(email: string, password: string): Promise<Session>;
  signOut(): Promise<void>;
  /** null once expired — callers must treat that as signed out. */
  session(): Promise<Session | null>;
  /** Throws PASSWORD_TOO_WEAK, or INVALID_CREDENTIALS if `current` is wrong. */
  changePassword(current: string, next: string): Promise<void>;
  onAuthStateChange(cb: (s: Session | null) => void): Unsubscribe;
  /**
   * Hands this console session back to the Gateways website — the reverse of
   * how staff got here in the first place. Website exchanges the code for its
   * own cookie session; see BACKEND-API-CONTRACT.md.
   */
  createWebsiteHandoff?(returnTo?: string): Promise<{ url: string; expiresAt: string }>;
}

export interface OverviewRepo {
  stats(): Promise<OverviewStats>;
  attention(): Promise<AttentionItem[]>;
  activity(limit?: number): Promise<AuditEvent[]>;
  announcements(): Promise<Announcement[]>;
}

export interface ParticipantFilter {
  search?: string;
  collegeId?: string;
  category?: string;
  gender?: string;
  docsComplete?: boolean;
  hasDues?: boolean;
}

export interface ParticipantRepo {
  list(filter?: ParticipantFilter): Promise<Participant[]>;
  get(id: string): Promise<Participant | null>;
  getByCode(code: string): Promise<Participant | null>;
  /** Free-text across name / code / phone / email — powers the desk search. */
  search(q: string, limit?: number): Promise<Participant[]>;
  flags(id: string): Promise<ParticipantFlags>;
  create(input: Omit<Participant, "id" | "code" | "createdAt" | "isBlocked">): Promise<Participant>;
  update(id: string, patch: Partial<Participant>): Promise<Participant>;
  /** Fuzzy match on email/phone/name — the duplicate-merge worklist. */
  findDuplicates(): Promise<{ a: Participant; b: Participant; reason: string; score: number }[]>;
  merge(keepId: string, mergeId: string): Promise<Participant>;
  /** DPDP obligation: hand back everything held about one person. */
  exportPersonalData(id: string): Promise<Record<string, unknown>>;
  erase(id: string): Promise<void>;
}

export interface RegistrationFilter {
  search?: string;
  status?: RegistrationStatus[];
  eventId?: string;
  collegeId?: string;
  category?: string;
  track?: string;
  paymentStatus?: string[];
  source?: string[];
  registeredAfter?: string;
  registeredBefore?: string;
  docsComplete?: boolean;
}

export interface RegistrationRepo {
  list(filter?: RegistrationFilter): Promise<Registration[]>;
  get(id: string): Promise<Registration | null>;
  forParticipant(participantId: string): Promise<Registration[]>;
  forEvent(eventId: string): Promise<Registration[]>;
  /**
   * Enforces: unique (eventId, participantId), capacity → waitlist, and the
   * registration window. Writes an audit event.
   */
  create(input: {
    participantId: string;
    eventId: string;
    teamId?: string | null;
    source?: "online" | "on_spot" | "csv_import";
  }): Promise<Registration>;
  setStatus(id: string, status: RegistrationStatus, reason?: string): Promise<Registration>;
  /** ADMIN-only, registration-specific payment-gate override with an audit reason. */
  overridePayment?(id: string, reason: string): Promise<Registration>;
  /** Cancelling a confirmed seat promotes the earliest waitlister. */
  cancel(id: string, reason: string): Promise<{ cancelled: Registration; promoted: Registration | null }>;
  bulkSetStatus(ids: string[], status: RegistrationStatus, reason?: string): Promise<number>;
  /** Same participant in two events whose times overlap. */
  clashes(): Promise<{ participantId: string; a: Registration; b: Registration }[]>;
  /** Dry-run a CSV import: what would be created, updated, or rejected. */
  previewImport(rows: string[][]): Promise<ImportPreview>;
  commitImport(preview: ImportPreview): Promise<{ created: number; skipped: number }>;
  waitlist(eventId: string): Promise<Registration[]>;
  promote(registrationId: string): Promise<Registration>;
}

export interface ImportRow {
  line: number;
  raw: string[];
  parsed: Partial<Participant> & { eventSlugs?: string[] };
  action: "create" | "update" | "skip" | "error";
  messages: string[];
}

export interface ImportPreview {
  rows: ImportRow[];
  summary: { create: number; update: number; skip: number; error: number };
}

export interface PaymentFilter {
  search?: string;
  status?: string[];
  method?: string[];
  minAmount?: number;
  maxAmount?: number;
  from?: string;
  to?: string;
  flaggedOnly?: boolean;
}

export interface PaymentRepo {
  list(filter?: PaymentFilter): Promise<Payment[]>;
  get(id: string): Promise<Payment | null>;
  forParticipant(participantId: string): Promise<Payment[]>;
  /** Verification queue, oldest first — the SLA is measured off this order. */
  queue(): Promise<Payment[]>;
  /**
   * A short-lived URL for the uploaded receipt file, or null when there is none
   * (cash at desk, or an erased receipt).
   *
   * Fetched per view rather than carried on `Payment`: the signature expires in
   * minutes, so a URL embedded in a list response would be dead before anyone
   * clicked it. Reading one is audited backend-side as `payment_receipt_viewed`.
   */
  receiptUrl(id: string): Promise<string | null>;
  /**
   * Records a payment. Rejects a reused UTR (`UTR_ALREADY_USED`) and a
   * breakdown that does not sum to `amount` (`AMOUNT_MISMATCH`).
   */
  create(input: {
    participantId: string;
    registrationIds: string[];
    method: string;
    utr?: string | null;
    amount: number;
    breakdown: Payment["breakdown"];
    receiptData?: string | null;
    receiptFileName?: string | null;
    deskShiftId?: string | null;
  }): Promise<Payment>;
  /** Idempotent: re-verifying returns the original record untouched. */
  review(
    id: string,
    decision: "verified" | "rejected" | "resubmit",
    note?: string,
  ): Promise<Payment>;
  bulkReview(ids: string[], decision: "verified" | "rejected", note?: string): Promise<number>;
  /** Recomputes fraud flags across the ledger. */
  runFraudSweep(): Promise<Payment[]>;
  outstanding(): Promise<
    { participant: Participant; due: number; paid: number; ageDays: number; registrations: number }[]
  >;
  /** Quote what a participant owes, applying early-bird / group / coupon rules. */
  quote(participantId: string, eventIds: string[], couponCode?: string): Promise<Payment["breakdown"]>;
}

export interface RefundRepo {
  list(): Promise<Refund[]>;
  request(input: {
    paymentId: string;
    amount: number;
    reasonCode: Refund["reasonCode"];
    reasonNote?: string;
  }): Promise<Refund>;
  /** Cannot exceed amount paid minus refunds already issued. */
  approve(id: string): Promise<Refund>;
  markPaid(id: string, payoutRef: string): Promise<Refund>;
  reject(id: string, note: string): Promise<Refund>;
}

export interface SettlementRepo {
  list(): Promise<Settlement[]>;
  /** Import bank statement rows and auto-match on UTR then amount+date. */
  importStatement(rows: string[][]): Promise<{ imported: number; matched: number }>;
  match(settlementId: string, paymentId: string): Promise<Settlement>;
  unmatch(settlementId: string): Promise<Settlement>;
  /** The two worklists that make end-of-fest accounting tractable. */
  unmatched(): Promise<{ inBank: Settlement[]; inApp: Payment[] }>;
}

export interface CouponRepo {
  list(): Promise<Coupon[]>;
  create(input: Omit<Coupon, "id" | "usedCount">): Promise<Coupon>;
  update(id: string, patch: Partial<Coupon>): Promise<Coupon>;
}

export interface CollegeRepo {
  list(): Promise<College[]>;
  get(id: string): Promise<College | null>;
  /** Contingent rollup — size, money, accommodation, arrival. */
  contingents(): Promise<
    {
      college: College;
      participants: number;
      confirmed: number;
      paid: number;
      due: number;
      accommodation: number;
      arrivalAt: string | null;
    }[]
  >;
  setVerified(id: string, verified: boolean): Promise<College>;
}

export interface EventRepo {
  list(): Promise<FestEvent[]>;
  get(id: string): Promise<FestEvent | null>;
  stats(eventId: string): Promise<EventStats>;
  allStats(): Promise<EventStats[]>;
  update(id: string, patch: Partial<FestEvent>): Promise<FestEvent>;
  /** Two events sharing a venue and overlapping in time. */
  venueClashes(): Promise<{ a: FestEvent; b: FestEvent }[]>;
}

export interface TeamRepo {
  list(eventId?: string): Promise<Team[]>;
  get(id: string): Promise<Team | null>;
  create(input: { eventId: string; name: string; leaderParticipantId: string }): Promise<Team>;
  addMember(teamId: string, participantId: string): Promise<Team>;
  removeMember(teamId: string, participantId: string): Promise<Team>;
  setLocked(teamId: string, locked: boolean): Promise<Team>;
  /** Teams below their event's minimum size — they cannot compete. */
  incomplete(): Promise<{ team: Team; event: FestEvent; short: number }[]>;
  substitutions(): Promise<SubstitutionRequest[]>;
  requestSubstitution(input: {
    teamId: string;
    outParticipantId: string;
    inParticipantId: string;
    reason: string;
  }): Promise<SubstitutionRequest>;
  reviewSubstitution(id: string, decision: "approved" | "rejected"): Promise<SubstitutionRequest>;
}

export interface DocumentRepo {
  list(status?: string): Promise<DocumentSubmission[]>;
  forParticipant(participantId: string): Promise<DocumentSubmission[]>;
  queue(): Promise<DocumentSubmission[]>;
  review(id: string, decision: "approved" | "rejected" | "resubmit", note?: string): Promise<DocumentSubmission>;
  /** Per-participant completeness against their category's required set. */
  completeness(): Promise<{ participantId: string; required: string[]; approved: string[]; missing: string[] }[]>;
}

export interface AccommodationRepo {
  requests(status?: string): Promise<AccommodationRequest[]>;
  allotments(): Promise<RoomAllotment[]>;
  occupancy(): Promise<
    { blockId: string; name: string; gender: string; capacity: number; occupied: number }[]
  >;
  /**
   * Refuses on unpaid dues (`PAYMENT_NOT_VERIFIED`), missing hostel documents
   * (`DOCS_INCOMPLETE`), a gender/block mismatch (`GENDER_MISMATCH`) or a full
   * room (`ROOM_FULL`).
   */
  allot(requestId: string, blockId: string, roomNo: string, bedNo: number): Promise<RoomAllotment>;
  autoAllot(requestIds: string[]): Promise<{ allotted: number; failed: { id: string; reason: string }[] }>;
  release(allotmentId: string): Promise<void>;
  checkIn(allotmentId: string, opts: { keyIssued: boolean; beddingIssued: boolean }): Promise<RoomAllotment>;
  checkOut(allotmentId: string, itemsReturned: boolean): Promise<RoomAllotment>;
  mealCoupons(participantId: string): Promise<MealCoupon[]>;
  issueMealCoupons(participantId: string, days: string[]): Promise<MealCoupon[]>;
  redeemMealCoupon(id: string): Promise<MealCoupon>;
}

export interface TravelRepo {
  records(direction?: "arrival" | "departure"): Promise<TravelRecord[]>;
  slots(): Promise<PickupSlot[]>;
  createSlot(input: Omit<PickupSlot, "id" | "status">): Promise<PickupSlot>;
  assignToSlot(travelId: string, slotId: string): Promise<TravelRecord>;
  setSlotStatus(slotId: string, status: PickupSlot["status"]): Promise<PickupSlot>;
  setTravelStatus(id: string, status: TravelRecord["status"]): Promise<TravelRecord>;
}

export interface AttendanceRepo {
  list(day?: string, eventId?: string): Promise<Attendance[]>;
  /** Idempotent — a second check-in returns the original with no side effects. */
  checkIn(input: {
    participantId: string;
    eventId?: string | null;
    method?: "qr" | "manual" | "self";
  }): Promise<{ record: Attendance; wasAlready: boolean }>;
  /** Confirmed but never checked in — candidates for waitlist reallocation. */
  noShows(eventId: string): Promise<Registration[]>;
}

export interface DeskRepo {
  shifts(): Promise<DeskShift[]>;
  openShift(input: { staffId: string; deskName: string; openingFloat: number }): Promise<DeskShift>;
  closeShift(id: string, countedCash: number, handoverTo: string): Promise<DeskShift>;
  currentShift(): Promise<DeskShift | null>;
  tokens(): Promise<QueueToken[]>;
  issueToken(purpose: QueueToken["purpose"], deskName: string): Promise<QueueToken>;
  serveToken(id: string): Promise<QueueToken>;
  kits(): Promise<KitIssue[]>;
  issueKit(input: { participantId: string; items: string[]; signature: boolean }): Promise<KitIssue>;
}

export interface CommsRepo {
  templates(): Promise<MessageTemplate[]>;
  saveTemplate(t: Omit<MessageTemplate, "updatedAt">): Promise<MessageTemplate>;
  broadcasts(): Promise<Broadcast[]>;
  /** Resolve an audience filter to a live count before sending. */
  previewAudience(filter: RegistrationFilter & ParticipantFilter): Promise<Participant[]>;
  send(input: {
    templateId: string;
    name: string;
    audience: RegistrationFilter & ParticipantFilter;
    scheduledAt?: string | null;
  }): Promise<Broadcast>;
  logs(broadcastId?: string): Promise<MessageLog[]>;
}

export interface CertificateRepo {
  list(): Promise<CertificateIssue[]>;
  /** Gated on attendance — you cannot certify someone who never showed. */
  issueBulk(input: {
    eventId: string | null;
    kind: CertificateIssue["kind"];
    participantIds: string[];
  }): Promise<{ issued: number; skipped: { participantId: string; reason: string }[] }>;
  revoke(id: string, reason: string): Promise<CertificateIssue>;
  verify(token: string): Promise<CertificateIssue | null>;
}

export interface HelpdeskRepo {
  list(status?: string): Promise<HelpdeskTicket[]>;
  create(input: Omit<HelpdeskTicket, "id" | "code" | "createdAt" | "updatedAt" | "resolvedAt" | "resolutionNote" | "status">): Promise<HelpdeskTicket>;
  update(id: string, patch: Partial<HelpdeskTicket>): Promise<HelpdeskTicket>;
  resolve(id: string, note: string): Promise<HelpdeskTicket>;
}

export interface StaffRepo {
  list(): Promise<StaffMember[]>;
  update(id: string, patch: Partial<StaffMember>): Promise<StaffMember>;
  create?(input: {
    name: string;
    email: string;
    phone: string;
    temporaryPassword: string;
    role: StaffRoleId;
    eventId: string | null;
  }): Promise<StaffMember>;
  grantAssignment?(id: string, role: StaffRoleId, eventId: string | null): Promise<StaffMember>;
  revokeAssignment?(id: string, assignmentId: string): Promise<StaffMember>;
  /** Verifications done, walk-ins handled, tickets closed — per member. */
  workload(): Promise<{ staffId: string; verifications: number; walkIns: number; tickets: number }[]>;
}

export interface AuditRepo {
  list(filter?: { entity?: string; actorId?: string; action?: string; limit?: number }): Promise<AuditEvent[]>;
}

export interface SavedViewRepo {
  list(scope: string): Promise<SavedView[]>;
  create(input: Omit<SavedView, "id">): Promise<SavedView>;
  remove(id: string): Promise<void>;
}

export interface AdminRepo {
  /**
   * Who the console is acting as — derived from the session.
   *
   * There is deliberately no `setActor`. It existed before login, and with
   * real accounts it is a one-click privilege escalation.
   */
  actor(): Promise<Actor | null>;
  /** Wipes and reseeds — used by /dev/data-test so runs are deterministic. */
  reset(seed?: number): Promise<void>;
  /** Advances the simulated clock so the dashboard visibly breathes. */
  tick(): Promise<void>;
}
