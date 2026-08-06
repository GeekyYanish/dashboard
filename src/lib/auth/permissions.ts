/**
 * THE PERMISSION MODEL — single source of truth.
 *
 * Two consumers, one map, never duplicated:
 *
 *   1. `assertCan()` in the repository — throws FORBIDDEN. This is the actual
 *      enforcement. Hiding a button is not access control.
 *   2. `useCan()` in the UI — decides what to *disable*, with a tooltip naming
 *      the role required. Deliberately disable rather than hide: an operator
 *      who can see why they cannot do something asks for the right permission;
 *      one who sees nothing files a bug.
 *
 * Before this existed, the matrix in settings-screen.tsx advertised ten
 * permissions and the repository enforced two. That is a picture of a security
 * model, not a security model.
 *
 * ── On the boundary ──────────────────────────────────────────────────────────
 * This runs in the browser, so it is not a security boundary — see the note in
 * ./session.ts. It is the correct SHAPE: when a server lands, `assertCan` moves
 * into a server action and every call site stays exactly where it is.
 */

import type { StaffRoleId } from "../fest.config";

export const CAPABILITIES = {
  "registrations.write": ["head", "coordinator", "desk"],
  "registrations.cancel": ["head", "coordinator"],
  "payments.verify": ["head", "coordinator", "finance"],
  "payments.collect": ["head", "desk"],
  "refunds.request": ["head", "coordinator", "finance"],
  "refunds.approve": ["head"],
  "settlements.reconcile": ["head", "finance"],
  "documents.review": ["head", "coordinator"],
  "accommodation.allot": ["head", "coordinator"],
  "travel.manage": ["head", "coordinator"],
  "attendance.checkin": ["head", "coordinator", "desk"],
  "comms.send": ["head", "coordinator"],
  "certificates.issue": ["head", "coordinator"],
  "helpdesk.manage": ["head", "coordinator", "desk"],
  "events.manage": ["head", "coordinator"],
  "staff.manageRoles": ["head"],
  "participants.erase": ["head"],
} as const satisfies Record<string, readonly StaffRoleId[]>;

export type Capability = keyof typeof CAPABILITIES;

/** Human-readable labels — used by the settings matrix and FORBIDDEN messages. */
export const CAPABILITY_LABELS: Record<Capability, string> = {
  "registrations.write": "Create & edit registrations",
  "registrations.cancel": "Cancel registrations",
  "payments.verify": "Verify payments",
  "payments.collect": "Collect payment at the desk",
  "refunds.request": "Request a refund",
  "refunds.approve": "Approve a refund",
  "settlements.reconcile": "Reconcile the bank statement",
  "documents.review": "Review documents",
  "accommodation.allot": "Allot accommodation",
  "travel.manage": "Manage travel & pickups",
  "attendance.checkin": "Check participants in",
  "comms.send": "Send broadcasts",
  "certificates.issue": "Issue certificates",
  "helpdesk.manage": "Work helpdesk tickets",
  "events.manage": "Edit events",
  "staff.manageRoles": "Change staff roles",
  "participants.erase": "Erase personal data",
};

export const ALL_CAPABILITIES = Object.keys(CAPABILITIES) as Capability[];

/** Every role can read the whole console — only mutations are gated. */
export function can(role: StaffRoleId | null | undefined, cap: Capability): boolean {
  if (!role) return false;
  return (CAPABILITIES[cap] as readonly string[]).includes(role);
}

/** Which roles hold a capability — for the "you need X" message. */
export function rolesFor(cap: Capability): readonly StaffRoleId[] {
  return CAPABILITIES[cap];
}

/** Everything a role may do. Drives the settings matrix and the test suite. */
export function capabilitiesOf(role: StaffRoleId): Capability[] {
  return ALL_CAPABILITIES.filter((c) => can(role, c));
}
