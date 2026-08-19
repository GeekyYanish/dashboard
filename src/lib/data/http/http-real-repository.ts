/* eslint-disable @typescript-eslint/no-explicit-any -- backend JSON is validated at the API boundary. */
import { api } from "./api-client";
import { selectedEventId } from "./scope";
import type { AuthRepo, AuditRepo, OverviewRepo, ParticipantRepo, RegistrationRepo, PaymentRepo, EventRepo, TeamRepo, StaffRepo, AdminRepo, Actor, ImportPreview } from "../repository";
import type { Session } from "../../auth/session";
import type { AttentionItem, AuditEvent, Announcement, EventStats, FestEvent, OverviewStats, Participant, ParticipantFlags, Payment, PaymentStatus, Registration, RegistrationStatus, StaffMember, SubstitutionRequest, Team } from "../types";
import { DataError, isDataError } from "../types";
import { type PaymentMethodId, type StaffRoleId } from "../../fest.config";

function iso(value: unknown) { return value ? new Date(String(value)).toISOString() : new Date(0).toISOString(); }
function scopeQuery() { return { eventId: selectedEventId() }; }

function staffRole(role: string): StaffRoleId {
  if (role === "ADMIN") return "head";
  if (role === "ORGANIZER") return "coordinator";
  if (role === "SCANNER") return "desk";
  return "viewer";
}

function backendStaffRole(role: StaffRoleId): "ADMIN" | "ORGANIZER" | "SCANNER" {
  if (role === "head") return "ADMIN";
  if (role === "coordinator") return "ORGANIZER";
  if (role === "desk") return "SCANNER";
  throw new DataError("VALIDATION_FAILED", "This live console supports ADMIN, ORGANIZER, and SCANNER assignments only.");
}

function toSession(value: any): Session {
  const assignments = (value.roles ?? []).map((assignment: any) => ({ role: staffRole(assignment.role), eventId: assignment.eventScopeId ?? null }));
  const roles = [...new Set(assignments.map((assignment: any) => assignment.role))] as StaffRoleId[];
  const role = roles.includes("head") ? "head" : roles.includes("coordinator") ? "coordinator" : roles.includes("desk") ? "desk" : "viewer";
  return {
    staffId: value.user.id,
    name: value.user.name ?? value.user.email,
    email: value.user.email,
    role,
    roles,
    assignments,
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
    mustChangePassword: Boolean(value.user.mustChangePassword),
  };
}

export class HttpAuth implements AuthRepo {
  private listeners = new Set<(session: Session | null) => void>();
  async signIn(): Promise<Session> { throw new DataError("VALIDATION_FAILED", "Sign in on the Gateways website to enter the console."); }
  async session(): Promise<Session | null> {
    try {
      return toSession(await api.get<any>("/api/v1/admin/auth/session"));
    } catch (error) {
      if (isDataError(error) && ["NOT_AUTHENTICATED", "FORBIDDEN"].includes(error.code)) return null;
      throw error;
    }
  }
  async signOut(): Promise<void> {
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin", cache: "no-store" });
    this.listeners.forEach((listener) => listener(null));
  }
  async changePassword(current: string, next: string): Promise<void> {
    await api.post("/api/v1/auth/change-password", { currentPassword: current, newPassword: next });
  }
  async createWebsiteHandoff(returnTo = "/"): Promise<{ url: string; expiresAt: string }> {
    return api.post("/api/v1/auth/website-handoff", { returnTo });
  }
  onAuthStateChange(cb: (s: Session | null) => void) {
    this.listeners.add(cb);
    // Only poll a visible tab: this runs independently of the shell's own
    // refresh timer, so a backgrounded console otherwise kept re-validating its
    // session forever for nobody's benefit.
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      // Same rule as the initial load in useAuth: only a genuine auth failure
      // ends the session. Swallowing every error into cb(null) signed the
      // operator out whenever the backend was briefly unreachable.
      void this.session().then(cb).catch((error: unknown) => {
        if (isDataError(error) && error.code === "STORAGE_UNAVAILABLE") return;
        cb(null);
      });
    }, 30_000);
    return () => { this.listeners.delete(cb); window.clearInterval(timer); };
  }
}

function toParticipant(value: any): Participant {
  return {
    id: value.id ?? value.userId,
    code: value.participantCode ?? "—",
    fullName: value.fullName ?? "—",
    email: value.email ?? "—",
    phone: value.phone ?? "—",
    gender: value.gender ?? "other",
    dateOfBirth: value.dateOfBirth ?? "",
    collegeId: value.collegeId ?? "—",
    department: value.department ?? value.departmentId ?? "—",
    yearOfStudy: Number(value.yearOfStudy ?? 0),
    category: value.category ?? "participant",
    tshirtSize: value.tshirtSize ?? "M",
    emergencyName: value.emergencyName ?? "—",
    emergencyPhone: value.emergencyPhone ?? "—",
    dietaryPref: value.dietaryPref ?? "veg",
    notes: value.bio ?? null,
    createdAt: iso(value.createdAt),
    createdVia: "online",
    isBlocked: Boolean(value.isBanned),
  };
}

export class HttpParticipants implements ParticipantRepo {
  async list(filter: any = {}) {
    const rows = await api.get<any[]>("/api/v1/admin/participants", { ...scopeQuery(), search: filter.search, collegeId: filter.collegeId, category: filter.category });
    return rows.map(toParticipant).filter((participant) => !filter.gender || participant.gender === filter.gender);
  }
  async get(id: string) {
    try { const value = await api.get<any>(`/api/v1/admin/participants/${id}`, scopeQuery()); return value?.participant ? toParticipant(value.participant) : null; } catch (error) { if (isDataError(error) && error.code === "NOT_FOUND") return null; throw error; }
  }
  async getByCode(code: string) { return (await this.list({ search: code })).find((participant) => participant.code.toLowerCase() === code.toLowerCase()) ?? null; }
  async search(q: string, limit = 50) { return (await this.list({ search: q })).slice(0, limit); }
  async flags(id: string): Promise<ParticipantFlags> {
    const participant = await this.get(id);
    // Payment listing is intentionally ADMIN-only. The scoped participant
    // detail endpoint still exposes the participant's pass gate to organizer
    // and scanner roles without exposing the payment review queue.
    const detail = await api.get<any>(`/api/v1/admin/participants/${id}`, scopeQuery());
    const payment = detail?.participant?.payment;
    const verified = payment?.status === "verified" ? Number(payment.amountInr ?? 0) : 0;
    const config = await api.get<{ amountInr: number }>("/api/v1/payment-receipts/config");
    return { isMinor: Boolean(participant?.dateOfBirth && new Date(participant.dateOfBirth).getTime() > new Date("2008-10-08").getTime()), docsComplete: true, missingDocs: [], amountDue: verified > 0 ? 0 : config.amountInr, amountPaid: verified };
  }
  async create(): Promise<Participant> { throw new DataError("FORBIDDEN", "The desk can create registrations only for existing paid participants."); }
  async update(id: string, patch: Partial<Participant>) {
    const value = await api.patch<any>(`/api/v1/admin/participants/${id}?eventId=${encodeURIComponent(selectedEventId() ?? "")}`, patch);
    return toParticipant(value);
  }
  async findDuplicates() { return []; }
  async merge(): Promise<Participant> { throw new DataError("FORBIDDEN", "Participant merging is not part of the live console core."); }
  async exportPersonalData(id: string) { const value = await api.get<any>(`/api/v1/admin/participants/${id}`, scopeQuery()); return value ?? {}; }
  async erase(): Promise<void> { throw new DataError("FORBIDDEN", "Participant erasure requires the approved privacy workflow."); }
}

function toRegistration(value: any): Registration {
  return {
    id: value.id,
    code: value.code ?? value.id,
    participantId: value.participantId,
    eventId: value.eventId,
    teamId: value.teamId ?? null,
    status: value.status,
    paymentStatus: value.paymentStatus ?? null,
    overrideActorId: value.overrideActorId ?? null,
    overrideReason: value.overrideReason ?? null,
    overrideAt: value.overrideAt ? iso(value.overrideAt) : null,
    eventTitle: value.eventTitle ?? null,
    participantName: value.participantName ?? null,
    participantEmail: value.participantEmail ?? null,
    participantCode: value.participantCode ?? null,
    waitlistPosition: value.waitlistPosition ?? null,
    feeInr: 0,
    registeredAt: iso(value.registeredAt),
    confirmedAt: value.confirmedAt ? iso(value.confirmedAt) : null,
    cancelledAt: value.cancelledAt ? iso(value.cancelledAt) : null,
    cancelReason: value.cancelledReason ?? null,
    source: value.source === "desk" ? "on_spot" : value.source ?? "online",
    notes: value.notes ?? value.overrideReason ?? null,
  };
}

export class HttpRegistrations implements RegistrationRepo {
  async list(filter: any = {}) {
    const values = await api.get<any[]>("/api/v1/admin/registrations", { ...scopeQuery(), eventId: filter.eventId ?? selectedEventId(), search: filter.search, status: filter.status?.join(",") });
    return values.map(toRegistration).filter((registration) => !filter.paymentStatus || filter.paymentStatus.includes(registration.paymentStatus ?? "unpaid"));
  }
  async get(id: string) { try { const value = await api.get<any>(`/api/v1/admin/registrations/${id}`); return value ? toRegistration(value) : null; } catch (error) { if (isDataError(error) && error.code === "NOT_FOUND") return null; throw error; } }
  async forParticipant(participantId: string) { return (await this.list()).filter((registration) => registration.participantId === participantId); }
  async forEvent(eventId: string) { return (await this.list({ eventId })); }
  async create(input: { participantId: string; eventId: string; teamId?: string | null; source?: "online" | "on_spot" | "csv_import" }) {
    return toRegistration(await api.post<any>("/api/v1/admin/registrations", { participantId: input.participantId, eventId: input.eventId, teamId: input.teamId ?? null, source: input.source ?? "on_spot" }));
  }
  async setStatus(id: string, status: RegistrationStatus, reason?: string) { return toRegistration(await api.patch<any>(`/api/v1/admin/registrations/${id}/status`, { status, note: reason })); }
  async overridePayment(id: string, reason: string) { return toRegistration(await api.post<any>(`/api/v1/admin/registrations/${id}/payment-override`, { reason })); }
  async cancel(id: string, reason: string) { const cancelled = await this.setStatus(id, "cancelled", reason); return { cancelled, promoted: null }; }
  async bulkSetStatus(ids: string[], status: RegistrationStatus, reason?: string) { for (const id of ids) await this.setStatus(id, status, reason); return ids.length; }
  async clashes() { return []; }
  async previewImport(_rows: string[][]): Promise<ImportPreview> { throw new DataError("FORBIDDEN", "CSV import is an isolated demo module until its backend workflow is approved."); }
  async commitImport(_preview: ImportPreview): Promise<{ created: number; skipped: number }> { throw new DataError("FORBIDDEN", "CSV import is an isolated demo module until its backend workflow is approved."); }
  async waitlist(eventId: string) { return this.forEvent(eventId).then((rows) => rows.filter((row) => row.status === "waitlisted")); }
  async promote(): Promise<Registration> { throw new DataError("FORBIDDEN", "Waitlist promotion is performed atomically by the backend."); }
}

function toPayment(value: any): Payment {
  const method = (value.method ?? null) as PaymentMethodId | null;
  return {
    id: value.id,
    invoiceSerial: value.invoiceSerial ?? null,
    participantId: value.participantId,
    registrationIds: value.registrationIds ?? [],
    method,
    utr: value.utr ?? null,
    amount: Number(value.amount ?? 0),
    breakdown: (value.breakdown ?? []).map((line: any) => ({ label: line.label, kind: "base", refId: null, amount: Number(line.amount) })),
    status: value.status as PaymentStatus,
    receiptData: null,
    receiptFileName: value.fileName ?? null,
    receiptHash: value.receiptHash ?? null,
    submittedAt: iso(value.submittedAt),
    reviewedBy: value.reviewedBy ?? null,
    reviewedAt: value.reviewedAt ? iso(value.reviewedAt) : null,
    reviewNote: value.reviewNote ?? null,
    deskShiftId: value.deskShiftId ?? null,
    fraudFlags: value.fraudFlags ?? [],
  };
}

export class HttpPayments implements PaymentRepo {
  async list(filter: any = {}) {
    const result = await api.get<any>("/api/v1/admin/payments", { status: filter.status?.[0], participantId: filter.participantId, limit: 200 });
    return (result.items ?? []).map(toPayment).filter((payment: Payment) => !filter.method || (payment.method != null && filter.method.includes(payment.method)));
  }
  async get(id: string) { try { const value = await api.get<any>(`/api/v1/admin/payments/${id}`); return value ? toPayment(value) : null; } catch (error) { if (isDataError(error) && error.code === "NOT_FOUND") return null; throw error; } }
  async forParticipant(participantId: string) {
    try {
      return await this.list({ participantId });
    } catch (error) {
      if (!isDataError(error) || !["FORBIDDEN", "NOT_AUTHENTICATED"].includes(error.code)) throw error;
      const detail = await api.get<any>(`/api/v1/admin/participants/${participantId}`, scopeQuery());
      const payment = detail?.participant?.payment;
      if (!payment) return [];
      return [toPayment({
        id: payment.id,
        participantId,
        registrationIds: (detail.registrations ?? []).map((registration: any) => registration.id),
        method: payment.method,
        utr: payment.transactionReference,
        amount: payment.amountInr,
        status: payment.status,
        submittedAt: payment.submittedAt,
        reviewedAt: payment.reviewedAt,
        reviewedBy: payment.reviewedBy,
        reviewNote: payment.rejectionReason,
      })];
    }
  }
  async queue() { return this.list({ status: ["pending"] }); }
  async receiptUrl(id: string) {
    // A same-origin path, deliberately not the storage URL. The Next proxy
    // attaches the console session, and the backend streams the bytes with an
    // inline Content-Disposition — the storage URL forces a download instead,
    // which is why embedded receipts rendered as nothing.
    return `/api/v1/admin/payments/${id}/receipt-file`;
  }
  async create(): Promise<Payment> { throw new DataError("FORBIDDEN", "Payment submission belongs to the participant website; the console reviews it."); }
  async review(id: string, decision: "verified" | "rejected" | "resubmit", note?: string) { return toPayment(await api.post<any>(`/api/v1/admin/payments/${id}/review`, { decision: decision === "resubmit" ? "rejected" : decision, reason: note })); }
  async bulkReview(ids: string[], decision: "verified" | "rejected", note?: string) { const result = await api.post<{ updated: number }>("/api/v1/admin/payments/bulk-review", { ids, decision, reason: note }); return result.updated; }
  async runFraudSweep() { return this.list(); }
  async outstanding() { return []; }
  async quote() { return []; }
}

function toEvent(value: any): FestEvent {
  const track = value.categorySlug?.includes("gaming") ? "gaming" : value.categorySlug?.includes("quiz") ? "literary" : value.categorySlug?.includes("design") ? "design" : value.categorySlug?.includes("culture") ? "cultural" : "technical";
  return { id: value.id, slug: value.slug, title: value.title, track: track as any, minTeamSize: value.minTeamSize ?? 1, maxTeamSize: value.maxTeamSize ?? 1, capacity: value.capacity ?? null, feeInr: value.feeAmount ?? 0, venue: value.venue ?? "—", day: value.startsAt?.slice(0, 10) ?? "2026-10-08", startsAt: iso(value.startsAt), endsAt: iso(value.endsAt), registrationClosesAt: value.registrationClosesAt ? iso(value.registrationClosesAt) : value.endsAt, requiresIndemnity: false, status: value.status, coordinatorName: "—", coordinatorPhone: "—" };
}

export class HttpEvents implements EventRepo {
  // The backend already filters this list to the caller's assignments. Do not
  // apply the currently selected event here: the selector needs the complete
  // accessible catalogue so changing scope does not collapse its options.
  async list() { return (await api.get<any[]>("/api/v1/admin/events")).map(toEvent); }
  async get(id: string) { try { const value = await api.get<any[]>("/api/v1/admin/events", { eventId: id }); return value[0] ? toEvent(value[0]) : null; } catch (error) { throw error; } }
  async stats(eventId: string): Promise<EventStats> { const value = await api.get<any>("/api/v1/admin/overview", { eventId }); return { eventId, confirmedCount: value.confirmedRegistrations ?? 0, pendingCount: value.pendingRegistrations ?? 0, waitlistCount: value.waitlistedRegistrations ?? 0, checkedInCount: 0, capacity: value.capacity ?? null, seatsLeft: value.capacity == null ? null : Math.max(0, value.capacity - (value.filledSeats ?? 0)), revenue: value.verifiedRevenueInr ?? 0 }; }
  async allStats() { const events = await this.list(); return Promise.all(events.map((event) => this.stats(event.id))); }
  async update(): Promise<FestEvent> { throw new DataError("FORBIDDEN", "Event edits are not enabled in the live registration core."); }
  async venueClashes() { return []; }
}

function toTeam(value: any): Team { return { id: value.id, eventId: value.eventId, name: value.name, joinCode: value.joinCode, leaderParticipantId: value.leaderUserId, memberIds: value.memberIds ?? [], isLocked: Boolean(value.isLocked), createdAt: iso(value.createdAt) }; }
export class HttpTeams implements TeamRepo {
  async list(eventId?: string) { return (await api.get<any[]>("/api/v1/admin/teams", { eventId: eventId ?? selectedEventId() })).map(toTeam); }
  async get(id: string) { try { return toTeam(await api.get<any>(`/api/v1/admin/teams/${id}`)); } catch (error) { if (isDataError(error) && error.code === "NOT_FOUND") return null; throw error; } }
  async create(): Promise<Team> { throw new DataError("FORBIDDEN", "Team changes are managed by participant registration rules."); }
  async addMember(): Promise<Team> { throw new DataError("FORBIDDEN", "Team changes are managed by participant registration rules."); }
  async removeMember(): Promise<Team> { throw new DataError("FORBIDDEN", "Team changes are managed by participant registration rules."); }
  async setLocked(id: string, locked: boolean) { return toTeam(await api.patch<any>(`/api/v1/admin/teams/${id}`, { isLocked: locked })); }
  async incomplete() { return []; }
  async substitutions() { return []; }
  async requestSubstitution(_input: { teamId: string; outParticipantId: string; inParticipantId: string; reason: string }): Promise<SubstitutionRequest> { throw new DataError("FORBIDDEN", "Substitutions are an isolated demo module."); }
  async reviewSubstitution(_id: string, _decision: "rejected" | "approved"): Promise<SubstitutionRequest> { throw new DataError("FORBIDDEN", "Substitutions are an isolated demo module."); }
}

function emptyOverview(value: any): OverviewStats {
  const expected = (value.totalParticipants ?? 0) * (value.entryPassAmountInr ?? 250);
  return { totalRegistrations: value.totalRegistrations ?? 0, confirmed: value.confirmedRegistrations ?? 0, pending: value.pendingRegistrations ?? 0, waitlisted: value.waitlistedRegistrations ?? 0, cancelled: value.cancelledRegistrations ?? 0, participants: value.totalParticipants ?? 0, collegesOnboarded: 0, revenueCollected: value.verifiedRevenueInr ?? 0, revenueExpected: expected, outstandingDues: Math.max(0, expected - (value.verifiedRevenueInr ?? 0)), verificationQueueDepth: value.pendingPayments ?? 0, oldestPendingHours: 0, accommodationRequested: 0, accommodationAllotted: 0, accommodationCapacity: 0, checkedInToday: 0, docsPending: 0, openTickets: 0, funnel: [{ stage: "Participants", count: value.totalParticipants ?? 0 }, { stage: "Registrations", count: value.totalRegistrations ?? 0 }, { stage: "Confirmed", count: value.confirmedRegistrations ?? 0 }], series: [], revenueByMethod: [], registrationsByTrack: [], topColleges: [] };
}

/**
 * The backend audit row is actor/action/target/metadata; the console's AuditEvent
 * is actor/action/entity/before-after. The shapes are close but not identical:
 *
 *  - `before` is always null. The backend stores no pre-images, and adding them
 *    is a schema change nobody asked for. The screen renders a single Details
 *    column so a null `before` is not a hole in the UI.
 *  - `note` carries the correlation id, which is what makes an audit row
 *    cross-referenceable against backend request logs.
 */
function toAuditEvent(value: any): AuditEvent {
  return {
    id: value.id,
    actorId: value.actorId,
    actorName: value.actorName ?? value.actorEmail ?? value.actorId,
    action: value.action,
    entity: value.targetType,
    entityId: value.targetId,
    before: null,
    after: (value.metadata ?? null) as Record<string, unknown> | null,
    at: iso(value.createdAt),
    note: value.correlationId ?? null,
  };
}

export class HttpAudit implements AuditRepo {
  async list(filter: { entity?: string; actorId?: string; action?: string; limit?: number } = {}) {
    try {
      const result = await api.get<any>("/api/v1/admin/audit", { action: filter.action, actorId: filter.actorId, limit: filter.limit ?? 200 });
      const rows = (result.items ?? []).map(toAuditEvent);
      // targetType is not a server-side filter: the console's `entity` facet is
      // computed from the loaded page, so filtering it here keeps the two in step.
      return filter.entity ? rows.filter((row: AuditEvent) => row.entity === filter.entity) : rows;
    } catch (error) {
      // A SCANNER (or any non-staff session) gets an empty log rather than a
      // crash — same treatment HttpStaff.list gives its own forbidden case.
      if (isDataError(error) && ["FORBIDDEN", "NOT_AUTHENTICATED"].includes(error.code)) return [];
      throw error;
    }
  }
}

export class HttpOverview implements OverviewRepo {
  async stats() { return emptyOverview(await api.get<any>("/api/v1/admin/overview", scopeQuery())); }
  async attention(): Promise<AttentionItem[]> { const stats = await this.stats(); return stats.verificationQueueDepth ? [{ id: "pending-payments", kind: "payment_aging", severity: "warning", title: "Payments awaiting review", detail: `${stats.verificationQueueDepth} receipt(s) need ADMIN verification.`, href: "/payments/queue", count: stats.verificationQueueDepth }] : []; }
  async activity(limit = 20): Promise<AuditEvent[]> { return new HttpAudit().list({ limit }); }
  async announcements(): Promise<Announcement[]> { return []; }
}

export class HttpStaff implements StaffRepo {
  async list() {
    try {
      const values = await api.get<any[]>("/api/v1/admin/staff");
      return values.map((value) => ({
        id: value.id,
        name: value.name,
        email: value.email,
        phone: value.phone ?? "—",
        role: value.assignments?.some((a: any) => a.role === "ADMIN") ? "head" : value.assignments?.some((a: any) => a.role === "ORGANIZER") ? "coordinator" : "desk",
        assignments: (value.assignments ?? []).map((assignment: any) => ({ id: assignment.id, role: staffRole(assignment.role), eventId: assignment.eventId ?? null })),
        isActive: true,
        joinedAt: new Date().toISOString(),
        passwordHash: "",
        passwordSalt: "",
        mustChangePassword: Boolean(value.mustChangePassword),
        lastLoginAt: null,
        failedAttempts: 0,
        lockedUntil: null,
      } as StaffMember));
    } catch (error) {
      if (isDataError(error) && ["FORBIDDEN", "NOT_AUTHENTICATED"].includes(error.code)) return [];
      throw error;
    }
  }
  async update(id: string, patch: Partial<StaffMember>) {
    if (patch.role) {
      const role = backendStaffRole(patch.role);
      const eventId = patch.role === "head" ? null : selectedEventId();
      if (patch.role !== "head" && !eventId) throw new DataError("VALIDATION_FAILED", "Select an event before granting an event-scoped role.");
      await api.post(`/api/v1/admin/staff/${id}/assignments`, { role, eventId });
    }
    return (await this.list()).find((value) => value.id === id)!;
  }
  async create(input: { name: string; email: string; phone: string; temporaryPassword: string; role: StaffRoleId; eventId: string | null }) {
    const role = backendStaffRole(input.role);
    const eventId = input.role === "head" ? null : input.eventId;
    if (input.role !== "head" && !eventId) throw new DataError("VALIDATION_FAILED", "Select an event for an organizer or scanner.");
    const created = await api.post<{ id: string }>("/api/v1/admin/staff", { name: input.name, email: input.email, phone: input.phone, temporaryPassword: input.temporaryPassword, assignments: [{ role, eventId }] });
    return (await this.list()).find((value) => value.id === created.id)!;
  }
  async grantAssignment(id: string, role: StaffRoleId, eventId: string | null) {
    const backendRole = backendStaffRole(role);
    const scopedEvent = role === "head" ? null : eventId;
    if (role !== "head" && !scopedEvent) throw new DataError("VALIDATION_FAILED", "Select an event for an organizer or scanner.");
    await api.post(`/api/v1/admin/staff/${id}/assignments`, { role: backendRole, eventId: scopedEvent });
    return (await this.list()).find((value) => value.id === id)!;
  }
  async revokeAssignment(id: string, assignmentId: string) {
    await api.delete(`/api/v1/admin/staff/${id}/assignments/${assignmentId}`);
    return (await this.list()).find((value) => value.id === id)!;
  }
  async workload() { return []; }
}

export class HttpAdmin implements AdminRepo {
  async actor(): Promise<Actor | null> { try { const session = await api.get<any>("/api/v1/admin/auth/session"); return { id: session.user.id, name: session.user.name ?? session.user.email, role: staffRole(session.roles?.find((role: any) => role.role === "ADMIN")?.role ?? session.roles?.[0]?.role ?? "SCANNER") }; } catch { return null; } }
  async reset(): Promise<void> { throw new DataError("FORBIDDEN", "Demo reset is disabled for live database data."); }
  async tick(): Promise<void> { /* no simulated clock in live mode */ }
}
