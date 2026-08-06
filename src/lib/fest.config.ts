/**
 * THE ONE FILE TO EDIT when this console is pointed at a different fest.
 *
 * Nothing else hardcodes the event's name, dates, fees, categories or tracks.
 * The seed generator, the fee engine, badge printing and every page label read
 * from here.
 */

export interface FestDay {
  key: string;
  label: string;
  date: string;
}

/**
 * Fest days are DERIVED from startsAt/endsAt, never hand-listed.
 *
 * They used to be a literal array, and it drifted: the fest moved to October
 * while `days` still said February, so everything day-keyed — attendance, meal
 * coupons, hostel nights, desk shifts — pointed at dates the fest no longer
 * had. Deriving them makes that class of bug impossible.
 *
 * Dates are taken from the ISO string's date component rather than via local
 * `Date` methods, so a machine outside IST cannot shift a day boundary.
 */
function deriveDays(startsAt: string, endsAt: string): FestDay[] {
  const dayMs = 86_400_000;
  const at = (iso: string) => {
    const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  const out: FestDay[] = [];
  const end = at(endsAt);
  for (let t = at(startsAt), i = 1; t <= end; t += dayMs, i++) {
    out.push({
      key: `d${i}`,
      label: `Day ${i}`,
      date: new Date(t).toISOString().slice(0, 10),
    });
  }
  return out;
}

const FEST_BASE = {
  name: "GATEWAYS",
  edition: "'26",
  fullName: "Gateways '26",
  tagline: "National Inter-Collegiate Tech Fest",
  host: "CHRIST (Deemed to be University)",
  city: "Bangalore, Karnataka",

  startsAt: "2026-10-08T09:00:00+05:30",
  endsAt: "2026-10-09T21:00:00+05:30",

  registrationOpensAt: "2025-09-01T00:00:00+05:30",
  registrationClosesAt: "2026-10-06T23:59:59+05:30",
  earlyBirdEndsAt: "2026-01-05T23:59:59+05:30",

  currency: "INR",
  currencySymbol: "₹",
  locale: "en-IN",
  timezone: "Asia/Kolkata",

  /** Serial prefixes. Kept here so a re-run of the fest can bump the series. */
  serials: {
    registration: "GWS26",
    invoice: "INV/GWS26",
    certificate: "CERT/GWS26",
    refund: "RFD/GWS26",
  },

  support: {
    email: "[EMAIL_ADDRESS]",
    phone: "+91 90000 12345",
    upiId: "gateways26@okicici",
    bank: {
      name: "Gateways '26 Fest Account",
      accountNo: "50100XXXXXX8842",
      ifsc: "HDFC0001234",
      branch: "Bangalore Main",
    },
  },
} as const;

export const FEST = {
  ...FEST_BASE,
  /** Day-scoped data (attendance, meal coupons, hostel nights) keys off these. */
  days: deriveDays(FEST_BASE.startsAt, FEST_BASE.endsAt),
};

// ---------------------------------------------------------------------------
// Registrant categories — each carries its own fee basis, required documents
// and badge colour. A national fest is not just "participants".
// ---------------------------------------------------------------------------

export const CATEGORIES = [
  {
    id: "participant",
    label: "Participant",
    short: "PTCP",
    blurb: "Competes in one or more events",
    baseFee: 350,
    badge: "#2c7f52",
    requiredDocs: ["college_id", "bonafide"],
  },
  {
    id: "delegate",
    label: "Delegate",
    short: "DLGT",
    blurb: "Attends without competing — talks, workshops, pro-shows",
    baseFee: 250,
    badge: "#3a6595",
    requiredDocs: ["college_id"],
  },
  {
    id: "accompanist",
    label: "Accompanist",
    short: "ACMP",
    blurb: "Supports a performing team (music, tech, lights)",
    baseFee: 150,
    badge: "#a97614",
    requiredDocs: ["college_id"],
  },
  {
    id: "faculty",
    label: "Faculty Escort",
    short: "FCLT",
    blurb: "Mandatory for contingents with under-18 members",
    baseFee: 0,
    badge: "#6f6f66",
    requiredDocs: ["institution_letter"],
  },
  {
    id: "volunteer",
    label: "Volunteer",
    short: "VOLR",
    blurb: "Host-campus organising crew",
    baseFee: 0,
    badge: "#2f7d80",
    requiredDocs: [],
  },
  {
    id: "guest",
    label: "Guest / Judge",
    short: "GUST",
    blurb: "Invited judge, speaker or artist",
    baseFee: 0,
    badge: "#cf4d1c",
    requiredDocs: [],
  },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];

// ---------------------------------------------------------------------------
// Tracks
// ---------------------------------------------------------------------------

export const TRACKS = [
  { id: "technical", label: "Technical", short: "TEC", hue: "#3a6595" },
  { id: "cultural", label: "Cultural", short: "CUL", hue: "#b5487a" },
  { id: "gaming", label: "Gaming & E-sports", short: "GAM", hue: "#6b4bb8" },
  { id: "literary", label: "Literary", short: "LIT", hue: "#a97614" },
  { id: "design", label: "Design", short: "DSG", hue: "#2f7d80" },
  { id: "sports", label: "Sports", short: "SPT", hue: "#2c7f52" },
] as const;

export type TrackId = (typeof TRACKS)[number]["id"];

// ---------------------------------------------------------------------------
// Documents the registration desk must collect and verify
// ---------------------------------------------------------------------------

export const DOC_TYPES = [
  {
    id: "college_id",
    label: "College ID card",
    blurb: "Photo ID issued by the participant's institution",
    gates: ["badge"],
  },
  {
    id: "bonafide",
    label: "Bonafide certificate",
    blurb: "Confirms current enrolment — signed by the HoD or Principal",
    gates: ["badge"],
  },
  {
    id: "guardian_consent",
    label: "Guardian consent",
    blurb: "Required for participants under 18 on the fest start date",
    gates: ["badge", "accommodation"],
  },
  {
    id: "indemnity",
    label: "Indemnity waiver",
    blurb: "Liability waiver — mandatory for sports and adventure events",
    gates: ["badge"],
  },
  {
    id: "id_proof",
    label: "Government ID proof",
    blurb: "Aadhaar / passport / driving licence — hostel requirement",
    gates: ["accommodation"],
  },
  {
    id: "institution_letter",
    label: "Institution letter",
    blurb: "Contingent nomination letter on college letterhead",
    gates: [],
  },
] as const;

export type DocTypeId = (typeof DOC_TYPES)[number]["id"];

// ---------------------------------------------------------------------------
// Fee model
// ---------------------------------------------------------------------------

export const FEES = {
  /** Applied to the base pass when paid before earlyBirdEndsAt. */
  earlyBirdDiscountPct: 20,
  /** Contingents of this size or larger get the group rate. */
  groupDiscountMinSize: 10,
  groupDiscountPct: 15,
  /** Surcharge for registering at the desk on fest days. */
  onSpotSurcharge: 100,
  accommodationPerNight: 1200,
  /** Refund policy, by days before the fest starts. */
  refundTiers: [
    { beforeDays: 21, refundPct: 100 },
    { beforeDays: 10, refundPct: 50 },
    { beforeDays: 0, refundPct: 0 },
  ],
} as const;

export const PAYMENT_METHODS = [
  { id: "upi", label: "UPI", blurb: "QR or VPA — verified against UTR", needsUtr: true },
  { id: "neft", label: "Bank transfer", blurb: "NEFT / IMPS / RTGS", needsUtr: true },
  { id: "cash", label: "Cash at desk", blurb: "Collected into a shift drawer", needsUtr: false },
  { id: "gateway", label: "Online gateway", blurb: "Card / netbanking", needsUtr: true },
] as const;

export type PaymentMethodId = (typeof PAYMENT_METHODS)[number]["id"];

// ---------------------------------------------------------------------------
// Registration team roles. The permission matrix in /settings reads this.
// ---------------------------------------------------------------------------

export const STAFF_ROLES = [
  {
    id: "head",
    label: "Registration Head",
    blurb: "Everything, including refunds and role changes",
  },
  {
    id: "coordinator",
    label: "Coordinator",
    blurb: "Registrations, documents, accommodation, travel, comms",
  },
  {
    id: "finance",
    label: "Finance Verifier",
    blurb: "Payment verification, reconciliation, invoices — no refund approval",
  },
  {
    id: "desk",
    label: "Desk Volunteer",
    blurb: "On-spot registration, cash collection, check-in, badge printing",
  },
  {
    id: "viewer",
    label: "Viewer",
    blurb: "Read-only across the console",
  },
] as const;

export type StaffRoleId = (typeof STAFF_ROLES)[number]["id"];

// ---------------------------------------------------------------------------
// Accommodation blocks
// ---------------------------------------------------------------------------

export const HOSTEL_BLOCKS = [
  { id: "blk-a", name: "Nilgiri Block", gender: "male", floors: 3, roomsPerFloor: 12, bedsPerRoom: 4 },
  { id: "blk-b", name: "Kaveri Block", gender: "male", floors: 3, roomsPerFloor: 10, bedsPerRoom: 4 },
  { id: "blk-c", name: "Malabar Block", gender: "female", floors: 3, roomsPerFloor: 12, bedsPerRoom: 4 },
  { id: "blk-d", name: "Sharavathi Block", gender: "female", floors: 2, roomsPerFloor: 10, bedsPerRoom: 4 },
  { id: "blk-f", name: "Guest House", gender: "any", floors: 2, roomsPerFloor: 6, bedsPerRoom: 2 },
] as const;

export const MEALS = [
  { id: "breakfast", label: "Breakfast" },
  { id: "lunch", label: "Lunch" },
  { id: "dinner", label: "Dinner" },
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function inr(amount: number, opts?: { compact?: boolean }): string {
  if (opts?.compact) {
    if (Math.abs(amount) >= 1e7) return `${FEST.currencySymbol}${(amount / 1e7).toFixed(2)}Cr`;
    if (Math.abs(amount) >= 1e5) return `${FEST.currencySymbol}${(amount / 1e5).toFixed(2)}L`;
    if (Math.abs(amount) >= 1e3) return `${FEST.currencySymbol}${(amount / 1e3).toFixed(1)}k`;
  }
  return `${FEST.currencySymbol}${amount.toLocaleString(FEST.locale)}`;
}

export const categoryById = (id: string) => CATEGORIES.find((c) => c.id === id);
export const trackById = (id: string) => TRACKS.find((t) => t.id === id);
export const docTypeById = (id: string) => DOC_TYPES.find((d) => d.id === id);
export const roleById = (id: string) => STAFF_ROLES.find((r) => r.id === id);
