import type { Tone } from "./components/neo";

/**
 * Status → tone, in one place.
 *
 * Colour is data (see components/neo/README.md rule 2), so the mapping from a
 * domain state to a hue is a design decision, not a per-component guess. If
 * "waitlisted" ever changes colour it changes here and nowhere else.
 */

export const REGISTRATION_TONE: Record<string, Tone> = {
  draft: "neutral",
  pending: "pending",
  confirmed: "paid",
  waitlisted: "waitlist",
  cancelled: "neutral",
  rejected: "failed",
};

export const REGISTRATION_LABEL: Record<string, string> = {
  draft: "Draft",
  pending: "Pending",
  confirmed: "Confirmed",
  waitlisted: "Waitlisted",
  cancelled: "Cancelled",
  rejected: "Rejected",
};

export const PAYMENT_TONE: Record<string, Tone> = {
  pending: "pending",
  verified: "paid",
  rejected: "failed",
  refunded: "neutral",
  partial: "waitlist",
};

export const PAYMENT_LABEL: Record<string, string> = {
  pending: "Awaiting review",
  verified: "Verified",
  rejected: "Rejected",
  refunded: "Refunded",
  partial: "Partial",
};

export const DOC_TONE: Record<string, Tone> = {
  pending: "pending",
  approved: "paid",
  rejected: "failed",
  resubmit: "waitlist",
};

export const TICKET_TONE: Record<string, Tone> = {
  open: "failed",
  in_progress: "pending",
  waiting: "waitlist",
  resolved: "paid",
  closed: "neutral",
};

export const PRIORITY_TONE: Record<string, Tone> = {
  low: "neutral",
  normal: "info",
  high: "pending",
  urgent: "failed",
};

export const ACCOMMODATION_TONE: Record<string, Tone> = {
  requested: "pending",
  allotted: "waitlist",
  checked_in: "paid",
  checked_out: "neutral",
  cancelled: "neutral",
};

export const REFUND_TONE: Record<string, Tone> = {
  requested: "pending",
  approved: "waitlist",
  paid: "paid",
  rejected: "failed",
};

export const EVENT_TONE: Record<string, Tone> = {
  draft: "neutral",
  published: "paid",
  registration_closed: "pending",
  ongoing: "info",
  completed: "neutral",
  cancelled: "failed",
};

export const TRAVEL_TONE: Record<string, Tone> = {
  expected: "pending",
  arrived: "info",
  picked_up: "paid",
  no_show: "failed",
  departed: "neutral",
};

/**
 * SLA ageing for the verification queue. The registration team commits to 24h;
 * these bands are what make a breach visible without reading a timestamp.
 */
export function slaTone(hours: number): Tone {
  if (hours < 6) return "paid";
  if (hours < 24) return "pending";
  return "failed";
}

export function slaLabel(hours: number): string {
  if (hours < 1) return "<1h";
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

export const titleCase = (s: string) =>
  s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
