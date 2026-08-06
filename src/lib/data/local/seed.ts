/**
 * FIXTURES — one small worked example.
 *
 * This replaced a generator that produced 2,414 participants, 6,161
 * registrations and 1,939 payments. That volume was the right amount of data to
 * *design* against — it is how the table performance ceiling and the empty-state
 * edges got found — and the wrong amount to hand anyone as a working tool.
 *
 * What survives is deliberately split in two:
 *
 *   ./catalogue.ts   configuration a real deployment needs on day one —
 *                    colleges, the event catalogue, venues, stations
 *   this file        ~20 participants and their paper trail, so no screen is
 *                    blank and every flow can be shown without data entry
 *
 * Everything here is disposable. Delete the `PEOPLE` array and ship only the
 * catalogue for a genuine empty production start.
 *
 * ── On the clock ────────────────────────────────────────────────────────────
 * The previous build froze "now" at a fixed date so the demo never shifted.
 * That is gone; the console runs on real time. Fixtures are dated *relative* to
 * the fest, so the seeded state is always a genuine pre-fest one — registrations
 * open, payments arriving, documents in review, hostels part-allotted.
 *
 * Attendance is near-zero on purpose. Nobody checks in weeks early, and seeding
 * fake check-ins would make every downstream number lie.
 */

import { CATEGORIES, FEES, FEST, HOSTEL_BLOCKS } from "../../fest.config";
import { COLLEGE_SEEDS, EVENT_SEEDS, VENUES, STATIONS } from "./catalogue";
import type {
  AccommodationRequest,
  Announcement,
  Attendance,
  AuditEvent,
  Broadcast,
  CertificateIssue,
  College,
  Coupon,
  DeskShift,
  DocumentSubmission,
  FeeLine,
  FestEvent,
  HelpdeskTicket,
  KitIssue,
  MealCoupon,
  MessageLog,
  MessageTemplate,
  Participant,
  Payment,
  PickupSlot,
  QueueToken,
  Refund,
  Registration,
  RoomAllotment,
  SavedView,
  Settlement,
  StaffMember,
  SubstitutionRequest,
  Team,
  TravelRecord,
} from "../types";

// ---------------------------------------------------------------------------
// Deterministic RNG — kept for the small amount of jitter the fixtures want
// (phone numbers, review timestamps). Same seed → same data, every reload.
// ---------------------------------------------------------------------------

export function makeRng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min,
    pick: <T>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)],
    bool: (p = 0.5) => next() < p,
  };
}
export type Rng = ReturnType<typeof makeRng>;

/** Cheap content hash — catches the same receipt image submitted twice. */
export function cheapHash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

const pad = (n: number, w: number) => String(n).padStart(w, "0");
const iso = (d: Date) => d.toISOString();
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
const addHours = (d: Date, n: number) => new Date(d.getTime() + n * 3600000);

// ---------------------------------------------------------------------------
// The worked example — 20 people, written out rather than generated.
//
// The composition is chosen so every screen has something real to show:
//   · a mix of categories, including a faculty escort and a volunteer
//   · two under-18s, so the guardian-consent gate is demonstrable
//   · out-station contingents who need beds and station pickups
//   · every payment state: verified, pending, rejected, partial, never paid
//   · one near-duplicate, so the merge worklist is not empty
// ---------------------------------------------------------------------------

type PersonSpec = {
  name: string;
  gender: "male" | "female" | "other";
  /** Age on the fest start date — under 18 triggers guardian consent. */
  age: number;
  college: string;
  dept: string;
  year: number;
  category: (typeof CATEGORIES)[number]["id"];
  tshirt: Participant["tshirtSize"];
  diet: Participant["dietaryPref"];
  events: string[];
  /** How their money stands. Drives payments, and so most of the console. */
  money: "paid" | "pending" | "rejected" | "unpaid" | "partial";
  /** Day keys needing a bed. Omitted = local, no accommodation. */
  nights?: string[];
  travel?: { mode: TravelRecord["mode"]; station: string; pickup: boolean };
};

const D1 = "d1";
const D2 = "d2";

const PEOPLE: PersonSpec[] = [
  { name: "Aditya Sharma", gender: "male", age: 20, college: "NITK", dept: "Computer Science", year: 3,
    category: "participant", tshirt: "L", diet: "veg", events: ["Hackathon 36", "Codeklash"],
    money: "paid", nights: [D1, D2], travel: { mode: "train", station: "KSR Bengaluru City Junction", pickup: true } },

  { name: "Meera Nair", gender: "female", age: 21, college: "CET", dept: "Information Science", year: 4,
    category: "participant", tshirt: "S", diet: "non_veg", events: ["UI/UX Sprint", "Poster Design"],
    money: "paid", nights: [D1, D2], travel: { mode: "flight", station: "Kempegowda International Airport", pickup: true } },

  { name: "Karthik Reddy", gender: "male", age: 19, college: "IIIT-H", dept: "Computer Science", year: 2,
    category: "participant", tshirt: "M", diet: "non_veg", events: ["Capture The Flag", "Codeklash"],
    money: "pending", nights: [D1, D2], travel: { mode: "train", station: "SMVT Bengaluru (Baiyappanahalli)", pickup: true } },

  { name: "Ananya Iyer", gender: "female", age: 17, college: "PSG Tech", dept: "Electronics & Communication", year: 1,
    category: "participant", tshirt: "XS", diet: "veg", events: ["Line Follower", "Circuit Debugging"],
    money: "paid", nights: [D1, D2], travel: { mode: "bus", station: "Majestic Bus Terminal", pickup: true } },

  { name: "Rohan Deshpande", gender: "male", age: 22, college: "COEP", dept: "Mechanical", year: 4,
    category: "participant", tshirt: "XL", diet: "non_veg", events: ["RoboSumo", "Project Expo"],
    money: "unpaid", nights: [D1, D2], travel: { mode: "train", station: "Yesvantpur Junction", pickup: false } },

  { name: "Sneha Pillai", gender: "female", age: 20, college: "RVCE", dept: "Artificial Intelligence & ML", year: 3,
    category: "participant", tshirt: "S", diet: "veg", events: ["Data Sprint", "Hackathon 36"], money: "paid" },

  { name: "Vikram Menon", gender: "male", age: 21, college: "BMSCE", dept: "Computer Science", year: 3,
    category: "participant", tshirt: "L", diet: "non_veg", events: ["Valorant", "BGMI"], money: "paid" },

  { name: "Priya Chatterjee", gender: "female", age: 19, college: "JU", dept: "Design", year: 2,
    category: "participant", tshirt: "M", diet: "vegan", events: ["Short Film", "Reel It"],
    money: "rejected", nights: [D1, D2], travel: { mode: "flight", station: "Kempegowda International Airport", pickup: true } },

  { name: "Arjun Rao", gender: "male", age: 20, college: "PESU", dept: "Information Science", year: 3,
    category: "participant", tshirt: "M", diet: "veg", events: ["Debate", "Model UN"], money: "paid" },

  { name: "Kavya Hegde", gender: "female", age: 18, college: "MSRIT", dept: "Computer Science", year: 2,
    category: "participant", tshirt: "S", diet: "veg", events: ["Solo Singing", "Group Singing"], money: "partial" },

  { name: "Faizan Ahmed", gender: "male", age: 21, college: "JMI", dept: "Civil", year: 4,
    category: "participant", tshirt: "L", diet: "non_veg", events: ["Bridge It", "CAD Wars"],
    money: "pending", nights: [D1, D2], travel: { mode: "train", station: "KSR Bengaluru City Junction", pickup: true } },

  { name: "Divya Krishnan", gender: "female", age: 20, college: "SSN", dept: "Data Science", year: 3,
    category: "participant", tshirt: "M", diet: "veg", events: ["Data Sprint", "Quiz Prelims"],
    money: "paid", nights: [D1], travel: { mode: "bus", station: "Majestic Bus Terminal", pickup: false } },

  { name: "Nikhil Gupta", gender: "male", age: 17, college: "DTU", dept: "Electrical", year: 1,
    category: "participant", tshirt: "M", diet: "veg", events: ["Circuit Debugging"],
    money: "unpaid", nights: [D1, D2], travel: { mode: "flight", station: "Kempegowda International Airport", pickup: true } },

  { name: "Tanvi Joshi", gender: "female", age: 22, college: "VJTI", dept: "Architecture", year: 4,
    category: "participant", tshirt: "S", diet: "jain", events: ["Poster Design", "Photography Walk"], money: "paid" },

  { name: "Sameer Kulkarni", gender: "male", age: 20, college: "KLETU", dept: "Mechanical", year: 3,
    category: "accompanist", tshirt: "L", diet: "non_veg", events: [], money: "paid",
    nights: [D1, D2], travel: { mode: "train", station: "Yesvantpur Junction", pickup: true } },

  { name: "Ishita Bose", gender: "female", age: 19, college: "NITC", dept: "Biotechnology", year: 2,
    category: "delegate", tshirt: "XS", diet: "veg", events: [], money: "paid",
    nights: [D1, D2], travel: { mode: "train", station: "SMVT Bengaluru (Baiyappanahalli)", pickup: true } },

  { name: "Suresh Nair", gender: "male", age: 44, college: "CET", dept: "Information Science", year: 1,
    category: "faculty", tshirt: "XL", diet: "veg", events: [], money: "paid",
    nights: [D1, D2], travel: { mode: "flight", station: "Kempegowda International Airport", pickup: true } },

  { name: "Riya Malhotra", gender: "female", age: 20, college: "DSCE", dept: "Computer Science", year: 3,
    category: "volunteer", tshirt: "S", diet: "veg", events: [], money: "paid" },

  { name: "Harsh Patel", gender: "male", age: 21, college: "Nirma", dept: "Chemical", year: 3,
    category: "participant", tshirt: "L", diet: "veg", events: ["Tug of War", "Futsal"],
    money: "pending", nights: [D1, D2], travel: { mode: "train", station: "KSR Bengaluru City Junction", pickup: false } },

  // Deliberate near-duplicate of Aditya Sharma — same phone, uppercased name,
  // different inbox, arrived via a college's CSV. Gives the merge worklist
  // something real to find.
  { name: "ADITYA SHARMA", gender: "male", age: 20, college: "NITK", dept: "Computer Science", year: 3,
    category: "participant", tshirt: "L", diet: "veg", events: ["Codeklash"], money: "unpaid" },
];

// ---------------------------------------------------------------------------

export interface SeedData {
  colleges: College[];
  events: FestEvent[];
  participants: Participant[];
  registrations: Registration[];
  teams: Team[];
  substitutions: SubstitutionRequest[];
  payments: Payment[];
  refunds: Refund[];
  settlements: Settlement[];
  coupons: Coupon[];
  documents: DocumentSubmission[];
  accommodation: AccommodationRequest[];
  allotments: RoomAllotment[];
  mealCoupons: MealCoupon[];
  travel: TravelRecord[];
  pickupSlots: PickupSlot[];
  attendance: Attendance[];
  kits: KitIssue[];
  shifts: DeskShift[];
  tokens: QueueToken[];
  templates: MessageTemplate[];
  broadcasts: Broadcast[];
  messageLogs: MessageLog[];
  certificates: CertificateIssue[];
  tickets: HelpdeskTicket[];
  staff: StaffMember[];
  audit: AuditEvent[];
  views: SavedView[];
  announcements: Announcement[];
  invoiceCounter: number;
}

export function generateSeed(seed = 20261008): SeedData {
  const rng = makeRng(seed);
  const now = new Date();
  const festStart = new Date(FEST.startsAt);
  const regOpen = new Date(FEST.registrationOpensAt);

  // -------------------------------------------------------------------------
  // Staff — five accounts, one per role.
  //
  // Hashes are PBKDF2-SHA256 (100k iterations, per-user random salt), computed
  // once and committed, exactly as a real seed migration does. Deriving them at
  // boot would force the whole synchronous store to become async for no gain.
  //
  // Every account starts with mustChangePassword: the documented defaults are a
  // way in, not a way to run a fest. "Reset demo data" on the login screen
  // restores them, so a forgotten password cannot lock anyone out.
  // -------------------------------------------------------------------------
  const staff: StaffMember[] = [
    {
      id: "stf-001", name: "Rhea Kamath", email: "head@gateways26.in",
      phone: "+91 90000 00001", role: "head", isActive: true,
      joinedAt: iso(addDays(regOpen, -14)),
      // Kestrel$Fest26
      passwordSalt: "2b78efd7cbaffcfbb1c976b18043dea5", passwordHash: "28dab07e823c27ccdd99e038aa2b971a688e4468ae06a7cd42661918f3697207",
      mustChangePassword: true, lastLoginAt: null, failedAttempts: 0, lockedUntil: null,
    },
    {
      id: "stf-002", name: "Aniket Deshpande", email: "coordinator@gateways26.in",
      phone: "+91 90000 00002", role: "coordinator", isActive: true,
      joinedAt: iso(addDays(regOpen, -10)),
      // Marigold$Fest26
      passwordSalt: "862ca403eed417a1fd9fcf5ece320356", passwordHash: "e3caeb8b1109644fd8c383d061d3d47e6267fd59bd9d8339e605ca7b22a67717",
      mustChangePassword: true, lastLoginAt: null, failedAttempts: 0, lockedUntil: null,
    },
    {
      id: "stf-003", name: "Vikram Shetty", email: "finance@gateways26.in",
      phone: "+91 90000 00003", role: "finance", isActive: true,
      joinedAt: iso(addDays(regOpen, -10)),
      // Sandalwood$26x
      passwordSalt: "bcbea2748fa95793783fdd2d821f717c", passwordHash: "8a77e14613d8a1f7a076b0383faf3b6b264f85f941db7c56e4392fd6d97c9d6f",
      mustChangePassword: true, lastLoginAt: null, failedAttempts: 0, lockedUntil: null,
    },
    {
      id: "stf-004", name: "Karan Bhat", email: "desk@gateways26.in",
      phone: "+91 90000 00004", role: "desk", isActive: true,
      joinedAt: iso(addDays(regOpen, -5)),
      // Peregrine$26x
      passwordSalt: "3866af79747cb88e3fee8851ac273062", passwordHash: "07a94806f4436be40834960af7f8ca11c9e4699546ecc85d7feb378ac6c23780",
      mustChangePassword: true, lastLoginAt: null, failedAttempts: 0, lockedUntil: null,
    },
    {
      id: "stf-005", name: "Joseph Kurian", email: "viewer@gateways26.in",
      phone: "+91 90000 00005", role: "viewer", isActive: true,
      joinedAt: iso(addDays(regOpen, -5)),
      // Cardamom$Fest26
      passwordSalt: "f038f53be3976154d55f9867ad269e8a", passwordHash: "9c906e41bb24eeabe43db22d2c620b0188aef7955f5924bce6e6a54b0cd7f3bc",
      mustChangePassword: true, lastLoginAt: null, failedAttempts: 0, lockedUntil: null,
    },
  ];
  const headId = staff[0].id;
  const coordId = staff[1].id;
  const financeId = staff[2].id;
  const deskId = staff[3].id;

  // ---- Reference catalogue -------------------------------------------------
  const colleges: College[] = COLLEGE_SEEDS.map(([name, short, city, state], i) => {
    const hasEscort = i % 3 === 0;
    return {
      id: `clg-${pad(i + 1, 3)}`,
      name,
      shortName: short,
      city,
      state,
      isVerified: i % 4 !== 3,
      contactName: `${["Aarav", "Diya", "Rohan", "Nisha", "Kabir"][i % 5]} ${["Sharma", "Nair", "Patil", "Rao", "Menon"][i % 5]}`,
      contactPhone: `+91 9${pad(rng.int(100000000, 999999999), 9)}`,
      contactEmail: `${short.toLowerCase().replace(/[^a-z]/g, "")}.contingent@gmail.com`,
      facultyEscortName: hasEscort ? `Prof. ${["Iyer", "Bose", "Kurian", "Gill"][i % 4]}` : null,
      facultyEscortPhone: hasEscort ? `+91 9${pad(rng.int(100000000, 999999999), 9)}` : null,
    };
  });
  const collegeByShort = new Map(colleges.map((c) => [c.shortName, c]));

  const events: FestEvent[] = EVENT_SEEDS.map(
    ([title, track, minT, maxT, cap, fee, indem], i) => {
      // Two days now, not three — FEST.days is derived from startsAt/endsAt.
      const dayIdx = i % FEST.days.length;
      const start = addHours(addDays(festStart, dayIdx), (i % 8) + 1);
      return {
        id: `evt-${pad(i + 1, 3)}`,
        slug: title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
        title,
        track: track as FestEvent["track"],
        minTeamSize: minT,
        maxTeamSize: maxT,
        capacity: cap,
        feeInr: fee,
        venue: VENUES[i % VENUES.length],
        day: FEST.days[dayIdx].key,
        startsAt: iso(start),
        endsAt: iso(addHours(start, 3)),
        registrationClosesAt: FEST.registrationClosesAt,
        requiresIndemnity: indem,
        status: "published",
        coordinatorName: `${["Meghana", "Tarun", "Ayesha", "Nithin"][i % 4]} ${["Rao", "Pai", "Rahman", "Shetty"][i % 4]}`,
        coordinatorPhone: `+91 9${pad(rng.int(100000000, 999999999), 9)}`,
      };
    },
  );
  const eventByTitle = new Map(events.map((e) => [e.title, e]));

  // ---- Participants --------------------------------------------------------
  const participants: Participant[] = PEOPLE.map((p, i) => {
    const college = collegeByShort.get(p.college) ?? colleges[0];
    const dob = new Date(festStart.getTime() - p.age * 365.25 * 86400000);
    const first = p.name.split(" ")[0].toLowerCase().replace(/[^a-z]/g, "");
    const last = p.name.split(" ").slice(-1)[0].toLowerCase().replace(/[^a-z]/g, "");
    const isDupe = i === PEOPLE.length - 1;
    // The duplicate shares a phone with the original — that is what makes it findable.
    const phoneOwner = isDupe ? 0 : i;
    return {
      id: `ptc-${pad(i + 1, 5)}`,
      code: `${FEST.serials.registration}-${pad(i + 1, 5)}`,
      fullName: p.name,
      email: isDupe ? `${first}.${last}@outlook.com` : `${first}.${last}@gmail.com`,
      phone: `+91 98${pad(45000000 + phoneOwner * 137, 8)}`,
      gender: p.gender,
      dateOfBirth: iso(dob).slice(0, 10),
      collegeId: college.id,
      department: p.dept,
      yearOfStudy: p.year,
      category: p.category,
      tshirtSize: p.tshirt,
      emergencyName: `${p.name.split(" ").slice(-1)[0]} (Guardian)`,
      emergencyPhone: `+91 9${pad(rng.int(100000000, 999999999), 9)}`,
      dietaryPref: p.diet,
      notes: null,
      createdAt: iso(addDays(now, -rng.int(3, 40))),
      createdVia: isDupe ? "csv_import" : i % 7 === 0 ? "on_spot" : "online",
      isBlocked: false,
    };
  });

  // ---- Registrations -------------------------------------------------------
  const registrations: Registration[] = [];
  let regNo = 0;
  PEOPLE.forEach((spec, i) => {
    const person = participants[i];
    for (const title of spec.events) {
      const ev = eventByTitle.get(title);
      if (!ev) continue;
      regNo++;
      const status: Registration["status"] = spec.money === "paid" ? "confirmed" : "pending";
      const registeredAt = iso(addDays(new Date(person.createdAt), 1));
      registrations.push({
        id: `reg-${pad(regNo, 5)}`,
        code: `R${pad(regNo, 6)}`,
        participantId: person.id,
        eventId: ev.id,
        teamId: null,
        status,
        waitlistPosition: null,
        feeInr: ev.feeInr,
        registeredAt,
        confirmedAt: status === "confirmed" ? iso(addDays(new Date(registeredAt), 1)) : null,
        cancelledAt: null,
        cancelReason: null,
        source: person.createdVia,
        notes: null,
      });
    }
  });

  // ---- Teams ---------------------------------------------------------------
  const hackathon = eventByTitle.get("Hackathon 36")!;
  const valorant = eventByTitle.get("Valorant")!;
  const teams: Team[] = [
    {
      id: "tm-0001",
      eventId: hackathon.id,
      name: "NITK Vortex",
      joinCode: "NIT428",
      leaderParticipantId: participants[0].id,
      memberIds: [participants[0].id, participants[5].id],
      isLocked: false,
      createdAt: iso(addDays(now, -18)),
    },
    {
      // Deliberately below Valorant's minimum of 5 — surfaces in the
      // incomplete-teams worklist.
      id: "tm-0002",
      eventId: valorant.id,
      name: "BMSCE Nova",
      joinCode: "BMS117",
      leaderParticipantId: participants[6].id,
      memberIds: [participants[6].id],
      isLocked: false,
      createdAt: iso(addDays(now, -12)),
    },
  ];
  for (const t of teams)
    for (const r of registrations)
      if (r.eventId === t.eventId && t.memberIds.includes(r.participantId)) r.teamId = t.id;

  const substitutions: SubstitutionRequest[] = [
    {
      id: "sub-001",
      teamId: teams[0].id,
      outParticipantId: participants[5].id,
      inParticipantId: participants[13].id,
      reason: "Semester exam clash — department will not grant leave",
      status: "pending",
      requestedAt: iso(addDays(now, -4)),
      reviewedBy: null,
      reviewedAt: null,
    },
  ];

  // ---- Accommodation -------------------------------------------------------
  const accommodation: AccommodationRequest[] = [];
  const allotments: RoomAllotment[] = [];
  const mealCoupons: MealCoupon[] = [];
  const bedCursor = new Map(HOSTEL_BLOCKS.map((b) => [b.id, { floor: 1, room: 1, bed: 1 }]));

  PEOPLE.forEach((spec, i) => {
    if (!spec.nights?.length) return;
    const person = participants[i];
    const reqId = `acc-${pad(accommodation.length + 1, 4)}`;
    // Only paid requests are allotted — that is the rule the repository
    // enforces, so the fixtures must not contradict it.
    const allot = spec.money === "paid" && accommodation.length % 2 === 0;
    accommodation.push({
      id: reqId,
      participantId: person.id,
      nights: [...spec.nights],
      gender: person.gender,
      specialNeeds: i === 3 ? "Ground floor — recovering from a knee injury" : null,
      status: allot ? "allotted" : "requested",
      requestedAt: iso(addDays(new Date(person.createdAt), 2)),
      amount: spec.nights.length * FEES.accommodationPerNight,
    });
    if (!allot) return;

    const block = HOSTEL_BLOCKS.find((b) => b.gender === person.gender || b.gender === "any");
    if (!block) return;
    const cur = bedCursor.get(block.id)!;
    if (cur.bed > block.bedsPerRoom) {
      cur.bed = 1;
      cur.room++;
    }
    const allottedAt = addDays(now, -rng.int(1, 6));
    allotments.push({
      id: `alt-${pad(allotments.length + 1, 4)}`,
      requestId: reqId,
      participantId: person.id,
      blockId: block.id,
      roomNo: `${cur.floor}${pad(cur.room, 2)}`,
      bedNo: cur.bed,
      allottedBy: coordId,
      allottedAt: iso(allottedAt),
      checkedInAt: null,
      checkedOutAt: null,
      keyIssued: false,
      beddingIssued: false,
      itemsReturned: false,
    });
    cur.bed++;
  });

  // ---- Travel --------------------------------------------------------------
  const pickupSlots: PickupSlot[] = [
    {
      id: "pks-001",
      station: STATIONS[0],
      windowStart: iso(addHours(addDays(festStart, -1), 6)),
      windowEnd: iso(addHours(addDays(festStart, -1), 10)),
      vehicle: "Tempo Traveller KA-01-8842",
      capacity: 12,
      driverName: "Mahesh Gowda",
      driverPhone: "+91 98450 11223",
      volunteerStaffId: deskId,
      status: "planned",
    },
    {
      id: "pks-002",
      station: STATIONS[3],
      windowStart: iso(addHours(addDays(festStart, -1), 11)),
      windowEnd: iso(addHours(addDays(festStart, -1), 16)),
      vehicle: "Bus KA-01-A-1120",
      capacity: 32,
      driverName: "Ibrahim Khan",
      driverPhone: "+91 98450 44556",
      volunteerStaffId: null,
      status: "planned",
    },
  ];

  const travel: TravelRecord[] = [];
  PEOPLE.forEach((spec, i) => {
    if (!spec.travel) return;
    const person = participants[i];
    const arriveAt = addHours(addDays(festStart, -1), 6 + (travel.length % 10));
    const slot = pickupSlots.find((s) => s.station === spec.travel!.station) ?? pickupSlots[0];
    travel.push({
      id: `trv-${pad(travel.length + 1, 5)}`,
      participantId: person.id,
      direction: "arrival",
      mode: spec.travel.mode,
      serviceRef:
        spec.travel.mode === "train"
          ? `${rng.int(12000, 22999)}`
          : spec.travel.mode === "flight"
            ? `6E-${rng.int(100, 999)}`
            : null,
      station: spec.travel.station,
      scheduledAt: iso(arriveAt),
      // One deliberately unassigned, so the "needs a vehicle" worklist is real.
      pickupSlotId: spec.travel.pickup && i !== 12 ? slot.id : null,
      needsPickup: spec.travel.pickup,
      status: "expected",
    });
    travel.push({
      id: `trv-${pad(travel.length + 1, 5)}`,
      participantId: person.id,
      direction: "departure",
      mode: spec.travel.mode,
      serviceRef: null,
      station: spec.travel.station,
      scheduledAt: iso(addHours(addDays(festStart, FEST.days.length), 6)),
      pickupSlotId: null,
      needsPickup: false,
      status: "expected",
    });
  });

  // ---- Payments ------------------------------------------------------------
  const payments: Payment[] = [];
  const usedUtr = new Set<string>();
  let payNo = 0;
  let invoiceCounter = 0;

  PEOPLE.forEach((spec, i) => {
    if (spec.money === "unpaid") return;
    const person = participants[i];
    const cat = CATEGORIES.find((c) => c.id === person.category)!;
    const mine = registrations.filter((r) => r.participantId === person.id);

    const breakdown: FeeLine[] = [];
    if (cat.baseFee > 0)
      breakdown.push({ label: `${cat.label} pass`, kind: "base", refId: null, amount: cat.baseFee });
    for (const r of mine) {
      const ev = events.find((e) => e.id === r.eventId)!;
      if (ev.feeInr > 0)
        breakdown.push({ label: ev.title, kind: "event", refId: r.id, amount: ev.feeInr });
    }
    const acc = accommodation.find((a) => a.participantId === person.id);
    if (acc)
      breakdown.push({
        label: `Accommodation · ${acc.nights.length} night${acc.nights.length > 1 ? "s" : ""}`,
        kind: "accommodation",
        refId: acc.id,
        amount: acc.amount,
      });
    if (!breakdown.length) return;

    // A partial payer settles only the first line; the rest stays outstanding.
    const lines = spec.money === "partial" ? breakdown.slice(0, 1) : breakdown;
    const amount = lines.reduce((s, b) => s + b.amount, 0);

    payNo++;
    const method = (["upi", "upi", "neft", "gateway", "cash"] as const)[i % 5];
    let utr: string | null = null;
    if (method !== "cash") {
      do {
        utr = `${rng.int(100000000000, 999999999999)}`;
      } while (usedUtr.has(utr));
      usedUtr.add(utr);
    }

    const submittedAt = addDays(new Date(person.createdAt), 2);
    const status: Payment["status"] =
      spec.money === "paid" || spec.money === "partial"
        ? "verified"
        : spec.money === "rejected"
          ? "rejected"
          : "pending";
    const reviewed = status !== "pending";
    const receiptData = method === "cash" ? null : `data:seed/${cheapHash(`${person.id}-${payNo}`)}`;

    payments.push({
      id: `pay-${pad(payNo, 5)}`,
      invoiceSerial:
        status === "verified" ? `${FEST.serials.invoice}/${pad(++invoiceCounter, 5)}` : null,
      participantId: person.id,
      registrationIds: mine.map((r) => r.id),
      method,
      utr,
      amount,
      breakdown: lines,
      status,
      receiptData,
      receiptFileName: receiptData ? `receipt-${person.code}.jpg` : null,
      receiptHash: receiptData ? cheapHash(receiptData) : null,
      submittedAt: iso(submittedAt),
      reviewedBy: reviewed ? (i % 2 === 0 ? financeId : headId) : null,
      reviewedAt: reviewed ? iso(addHours(submittedAt, rng.int(3, 30))) : null,
      reviewNote:
        status === "rejected" ? "Screenshot unreadable — please re-upload a clearer receipt" : null,
      deskShiftId: null,
      fraudFlags: [],
    });
  });

  // Two deliberate fraud cases, one per check, so the sweep has something real
  // to catch: the same transaction reference claimed twice, and the same
  // receipt screenshot submitted by two people.
  const withUtr = payments.filter((p) => p.utr);
  if (withUtr.length >= 2) withUtr[1].utr = withUtr[0].utr;
  const withReceipt = payments.filter((p) => p.receiptHash);
  if (withReceipt.length >= 4) withReceipt[3].receiptHash = withReceipt[2].receiptHash;

  // ---- Refunds -------------------------------------------------------------
  const refundable = payments.find((p) => p.status === "verified");
  const refunds: Refund[] = refundable
    ? [
        {
          id: "rfd-0001",
          serial: `${FEST.serials.refund}/0001`,
          paymentId: refundable.id,
          participantId: refundable.participantId,
          amount: Math.round(refundable.amount * 0.4),
          reasonCode: "withdrawal",
          reasonNote: "Withdrew from one event after the team was re-formed",
          status: "requested",
          requestedBy: coordId,
          requestedAt: iso(addDays(now, -2)),
          approvedBy: null,
          approvedAt: null,
          paidAt: null,
          payoutRef: null,
        },
      ]
    : [];

  // ---- Settlements — two matched, one unidentified credit -------------------
  const settlements: Settlement[] = payments
    .filter((p) => p.utr && p.status === "verified")
    .slice(0, 2)
    .map((p, i) => ({
      id: `stl-${pad(i + 1, 4)}`,
      bankRef: p.utr!,
      amount: p.amount,
      valueDate: p.submittedAt.slice(0, 10),
      narration: `UPI/${p.utr}/GATEWAYS26/${p.participantId.toUpperCase()}`,
      matchedPaymentId: p.id,
      matchConfidence: "exact" as const,
      importedAt: iso(addDays(now, -1)),
    }));
  settlements.push({
    id: "stl-0099",
    bankRef: `${rng.int(100000000000, 999999999999)}`,
    amount: 2500,
    valueDate: iso(addDays(now, -3)).slice(0, 10),
    narration: "NEFT/UNIDENTIFIED/CONTINGENT ADVANCE",
    matchedPaymentId: null,
    matchConfidence: "none",
    importedAt: iso(addDays(now, -1)),
  });

  // ---- Documents -----------------------------------------------------------
  const documents: DocumentSubmission[] = [];
  PEOPLE.forEach((spec, i) => {
    const person = participants[i];
    const cat = CATEGORIES.find((c) => c.id === person.category)!;
    const required = new Set<string>(cat.requiredDocs);
    if (spec.age < 18) required.add("guardian_consent");
    if (spec.events.some((t) => eventByTitle.get(t)?.requiresIndemnity)) required.add("indemnity");
    if (spec.nights?.length) required.add("id_proof");

    [...required].forEach((docType, j) => {
      // Leave a few gaps so the completeness matrix and the badge gate mean something.
      if ((i + j) % 5 === 4) return;
      const submittedAt = addDays(new Date(person.createdAt), 3);
      const status: DocumentSubmission["status"] =
        (i + j) % 7 === 0 ? "pending" : (i + j) % 11 === 3 ? "resubmit" : "approved";
      documents.push({
        id: `doc-${pad(documents.length + 1, 4)}`,
        participantId: person.id,
        docType: docType as DocumentSubmission["docType"],
        fileName: `${docType}-${person.code}.pdf`,
        fileData: null,
        status,
        submittedAt: iso(submittedAt),
        reviewedBy: status === "pending" ? null : coordId,
        reviewedAt: status === "pending" ? null : iso(addHours(submittedAt, 20)),
        reviewNote: status === "resubmit" ? "Scan is cropped — resubmit the full page" : null,
      });
    });
  });

  // ---- Attendance ----------------------------------------------------------
  // Deliberately tiny: the fest is still weeks away, and the only people
  // "checked in" are the three who collected badges early at the registration
  // office. Seeding more would be a lie the whole dashboard then repeats.
  const attendance: Attendance[] = participants.slice(0, 3).map((p, i) => ({
    id: `att-${pad(i + 1, 4)}`,
    participantId: p.id,
    eventId: null,
    registrationId: null,
    method: "manual" as const,
    checkedInAt: iso(addHours(now, -(i + 1) * 5)),
    scannedBy: deskId,
    day: FEST.days[0].key,
  }));

  const kits: KitIssue[] = attendance.slice(0, 2).map((a, i) => ({
    id: `kit-${pad(i + 1, 4)}`,
    participantId: a.participantId,
    tshirtSize: participants.find((p) => p.id === a.participantId)?.tshirtSize ?? "M",
    items: ["T-shirt", "ID lanyard", "Event booklet", "Tote bag"],
    issuedAt: a.checkedInAt,
    issuedBy: deskId,
    signature: true,
  }));

  // ---- Desk ----------------------------------------------------------------
  const shifts: DeskShift[] = [
    {
      id: "shf-001",
      staffId: deskId,
      deskName: "Main Gate Desk",
      day: FEST.days[0].key,
      startsAt: iso(addHours(now, -2)),
      endsAt: iso(addHours(now, 4)),
      status: "open",
      openingFloat: 2000,
      expectedCash: payments.filter((p) => p.method === "cash").reduce((s, p) => s + p.amount, 0),
      countedCash: null,
      handoverTo: null,
      closedAt: null,
    },
    {
      id: "shf-002",
      staffId: deskId,
      deskName: "Admin Block Desk",
      day: FEST.days[0].key,
      startsAt: iso(addHours(now, 4)),
      endsAt: iso(addHours(now, 10)),
      status: "scheduled",
      openingFloat: 2000,
      expectedCash: 0,
      countedCash: null,
      handoverTo: null,
      closedAt: null,
    },
  ];
  for (const p of payments) if (p.method === "cash") p.deskShiftId = shifts[0].id;

  const tokens: QueueToken[] = [];

  // ---- Communications ------------------------------------------------------
  const templates: MessageTemplate[] = [
    {
      id: "tpl-001",
      name: "Registration confirmed",
      channel: "email",
      subject: `Your ${FEST.fullName} registration is confirmed`,
      body: `Hi {{fullName}},\n\nYour registration for ${FEST.fullName} is confirmed.\nRegistration ID: {{code}}\nEvents: {{eventList}}\n\nShow the attached QR at the registration desk.\n\n— Registration Team`,
      mergeFields: ["fullName", "code", "eventList"],
      updatedAt: iso(addDays(now, -20)),
    },
    {
      id: "tpl-002",
      name: "Payment reminder",
      channel: "whatsapp",
      subject: null,
      body: `Hi {{fullName}}, we haven't received your ${FEST.fullName} fee of ₹{{amountDue}} yet. Registration closes {{closeDate}}. Pay via UPI: ${FEST.support.upiId}`,
      mergeFields: ["fullName", "amountDue", "closeDate"],
      updatedAt: iso(addDays(now, -8)),
    },
    {
      id: "tpl-003",
      name: "Documents pending",
      channel: "email",
      subject: "Action needed: documents pending",
      body: `Hi {{fullName}},\n\nWe still need: {{missingDocs}}.\nUpload before {{closeDate}} or we cannot issue your badge.\n\n— Registration Team`,
      mergeFields: ["fullName", "missingDocs", "closeDate"],
      updatedAt: iso(addDays(now, -5)),
    },
    {
      id: "tpl-004",
      name: "Arrival & gate brief",
      channel: "sms",
      subject: null,
      body: `${FEST.fullName} starts {{startDate}}. Gate opens 7am. Carry your college ID. Desk: ${FEST.support.phone}`,
      mergeFields: ["startDate"],
      updatedAt: iso(addDays(now, -3)),
    },
    {
      id: "tpl-005",
      name: "Accommodation allotted",
      channel: "whatsapp",
      subject: null,
      body: `Hi {{fullName}}, your hostel is {{block}}, Room {{room}}, Bed {{bed}}. Carry a government ID for hostel check-in.`,
      mergeFields: ["fullName", "block", "room", "bed"],
      updatedAt: iso(addDays(now, -6)),
    },
  ];

  const broadcasts: Broadcast[] = [
    {
      id: "bc-001",
      templateId: "tpl-002",
      name: "Unpaid reminder — first sweep",
      audience: { paymentStatus: ["pending"] },
      audienceCount: 4,
      channel: "whatsapp",
      status: "sent",
      scheduledAt: null,
      sentAt: iso(addDays(now, -6)),
      sentCount: 4,
      failedCount: 1,
      createdBy: coordId,
    },
  ];

  const messageLogs: MessageLog[] = participants.slice(0, 4).map((p, i) => ({
    id: `msg-${pad(i + 1, 4)}`,
    broadcastId: "bc-001",
    participantId: p.id,
    channel: "whatsapp" as const,
    subject: null,
    status: (i === 3 ? "bounced" : "delivered") as MessageLog["status"],
    sentAt: iso(addDays(now, -6)),
    error: i === 3 ? "Number not registered on WhatsApp" : null,
  }));

  // Nobody has attended anything yet, so nothing can be certified. Correct —
  // issuance is gated on attendance.
  const certificates: CertificateIssue[] = [];

  // ---- Helpdesk ------------------------------------------------------------
  const tickets: HelpdeskTicket[] = [
    {
      id: "tkt-0001",
      code: "HD-0001",
      participantId: participants[4].id,
      category: "payment_not_reflected",
      subject: "Paid via UPI two days ago, console still shows unpaid",
      body: "Transferred ₹850 on the 2nd and the bank shows it debited. The portal still lists dues.",
      priority: "high",
      status: "open",
      assignedTo: null,
      createdAt: iso(addHours(now, -30)),
      updatedAt: iso(addHours(now, -30)),
      resolvedAt: null,
      resolutionNote: null,
    },
    {
      id: "tkt-0002",
      code: "HD-0002",
      participantId: participants[3].id,
      category: "accommodation",
      subject: "Need a ground-floor room — knee injury",
      body: "Recovering from surgery and cannot manage stairs with luggage.",
      priority: "normal",
      status: "in_progress",
      assignedTo: coordId,
      createdAt: iso(addHours(now, -50)),
      updatedAt: iso(addHours(now, -12)),
      resolvedAt: null,
      resolutionNote: null,
    },
    {
      id: "tkt-0003",
      code: "HD-0003",
      participantId: participants[9].id,
      category: "name_correction",
      subject: "Name misspelt on the registration",
      body: "Shows “Kavia”, should be “Kavya”. The badge needs to be right.",
      priority: "low",
      status: "resolved",
      assignedTo: deskId,
      createdAt: iso(addHours(now, -80)),
      updatedAt: iso(addHours(now, -70)),
      resolvedAt: iso(addHours(now, -70)),
      resolutionNote: "Corrected on the participant record and confirmed by phone.",
    },
  ];

  // ---- Saved views & announcements -----------------------------------------
  const views: SavedView[] = [
    { id: "vw-001", name: "Unpaid registrations", scope: "registrations", filters: { paymentStatus: ["pending"] }, createdBy: headId, isShared: true },
    { id: "vw-002", name: "Documents incomplete", scope: "registrations", filters: { docsComplete: false }, createdBy: coordId, isShared: true },
    { id: "vw-003", name: "Flagged payments", scope: "payments", filters: { flaggedOnly: true }, createdBy: financeId, isShared: true },
  ];

  const announcements: Announcement[] = [
    {
      id: "ann-001",
      title: `Registration closes ${new Date(FEST.registrationClosesAt).toLocaleDateString("en-IN", { day: "numeric", month: "long" })}`,
      body: "No extensions. On-spot registration will be available at the Main Gate Desk with a ₹100 surcharge.",
      severity: "warning",
      publishedAt: iso(addDays(now, -2)),
      expiresAt: FEST.registrationClosesAt,
      createdBy: headId,
    },
    {
      id: "ann-002",
      title: "Hostel allotment round 1 published",
      body: "Paid, document-complete requests have been allotted. The rest clear as payments are verified.",
      severity: "info",
      publishedAt: iso(addDays(now, -1)),
      expiresAt: null,
      createdBy: coordId,
    },
  ];

  // ---- Audit — derived from the fixtures above, never invented --------------
  const audit: AuditEvent[] = [];
  const nameOf = (id: string) => staff.find((s) => s.id === id)?.name ?? "System";
  for (const p of payments) {
    if (!p.reviewedAt || !p.reviewedBy) continue;
    audit.push({
      id: `aud-${p.id}`,
      actorId: p.reviewedBy,
      actorName: nameOf(p.reviewedBy),
      action: p.status === "verified" ? "payment.verified" : "payment.rejected",
      entity: "payment",
      entityId: p.id,
      before: { status: "pending" },
      after: { status: p.status },
      at: p.reviewedAt,
      note: p.reviewNote,
    });
  }
  for (const a of allotments) {
    audit.push({
      id: `aud-${a.id}`,
      actorId: a.allottedBy,
      actorName: nameOf(a.allottedBy),
      action: "accommodation.allotted",
      entity: "allotment",
      entityId: a.id,
      before: null,
      after: { blockId: a.blockId, roomNo: a.roomNo, bedNo: a.bedNo },
      at: a.allottedAt,
      note: null,
    });
  }
  audit.sort((x, y) => (x.at < y.at ? 1 : -1));

  const coupons: Coupon[] = [
    { id: "cpn-001", code: "EARLYGATE", kind: "percent", value: 20, maxUses: 500, usedCount: 12, expiresAt: FEST.earlyBirdEndsAt, isActive: false, appliesTo: "all" },
    { id: "cpn-002", code: "CONTINGENT15", kind: "percent", value: 15, maxUses: 200, usedCount: 3, expiresAt: null, isActive: true, appliesTo: "all" },
    { id: "cpn-003", code: "DELEGATE100", kind: "flat", value: 100, maxUses: 150, usedCount: 1, expiresAt: null, isActive: true, appliesTo: "delegate" },
  ];

  return {
    colleges, events, participants, registrations, teams, substitutions,
    payments, refunds, settlements, coupons, documents, accommodation,
    allotments, mealCoupons, travel, pickupSlots, attendance, kits, shifts,
    tokens, templates, broadcasts, messageLogs, certificates, tickets, staff,
    audit, views, announcements, invoiceCounter,
  };
}
