/**
 * Deterministic seed generator.
 *
 * Everything derives from a fixed-seed PRNG, so the dashboard shows the SAME
 * numbers on every reload. That matters more than it sounds: a demo where the
 * revenue figure reshuffles each refresh reads as broken, and /dev/data-test
 * could not assert anything stable.
 */

import {
  CATEGORIES,
  FEES,
  FEST,
  HOSTEL_BLOCKS,
  PAYMENT_METHODS,
} from "../../fest.config";
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
// PRNG — mulberry32. Small, fast, and good enough that the distributions look
// organic rather than uniform.
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
    /** Weighted pick — [value, weight][]. */
    weighted: <T>(pairs: readonly (readonly [T, number])[]): T => {
      const total = pairs.reduce((s, p) => s + p[1], 0);
      let r = next() * total;
      for (const [v, w] of pairs) {
        r -= w;
        if (r <= 0) return v;
      }
      return pairs[pairs.length - 1][0];
    },
    bool: (p = 0.5) => next() < p,
    /** Bell-ish distribution — more realistic than flat for counts and times. */
    gauss: (mean: number, sd: number) => {
      const u = 1 - next();
      const v = next();
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    shuffle: <T>(arr: T[]): T[] => {
      const a2 = [...arr];
      for (let i = a2.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [a2[i], a2[j]] = [a2[j], a2[i]];
      }
      return a2;
    },
  };
}

export type Rng = ReturnType<typeof makeRng>;

// ---------------------------------------------------------------------------
// Name pools — Indian names, because a national fest in Karnataka draws from
// across the country and placeholder "John Doe" data reads as unconsidered.
// ---------------------------------------------------------------------------

const FIRST_M = [
  "Aarav","Aditya","Akash","Amit","Aniket","Anirudh","Arjun","Arnav","Ashwin","Bhavesh",
  "Chirag","Darshan","Deepak","Dhruv","Gaurav","Harsh","Hemanth","Ishaan","Jatin","Kabir",
  "Karan","Kartik","Kaushik","Kiran","Krishna","Lakshya","Madhav","Manish","Mohit","Naveen",
  "Nikhil","Nithin","Om","Pranav","Prateek","Rahul","Rajat","Rakesh","Rohan","Rohit",
  "Sagar","Sahil","Sandeep","Sanjay","Shashank","Shivam","Siddharth","Sumit","Tarun","Varun",
  "Vedant","Vignesh","Vikram","Vinay","Vishal","Yash","Zaid","Faizan","Irfan","Sameer",
];
const FIRST_F = [
  "Aanya","Aditi","Aishwarya","Akshara","Ananya","Anjali","Anushka","Aparna","Arya","Avni",
  "Bhavana","Chaitra","Deepika","Divya","Gayathri","Harini","Ishita","Jahnavi","Kavya","Keerthi",
  "Lavanya","Madhuri","Meera","Meghana","Mitali","Namrata","Neha","Nidhi","Nikita","Pallavi",
  "Pooja","Prachi","Pranathi","Priya","Radhika","Rashmi","Riya","Sanjana","Sanya","Shreya",
  "Shruti","Sneha","Sonali","Sowmya","Sridevi","Swati","Tanvi","Trisha","Vaishnavi","Varsha",
  "Zoya","Fatima","Ayesha","Nazia","Simran","Kiara","Ira","Myra","Saanvi","Diya",
];
const LAST = [
  "Sharma","Verma","Gupta","Reddy","Rao","Nair","Menon","Iyer","Iyengar","Pillai",
  "Shetty","Hegde","Bhat","Kamath","Pai","Prabhu","Kulkarni","Deshpande","Joshi","Patil",
  "Patel","Shah","Mehta","Desai","Trivedi","Chauhan","Rathore","Singh","Kaur","Gill",
  "Banerjee","Chatterjee","Mukherjee","Ghosh","Das","Bose","Dutta","Sen","Roy","Saha",
  "Naidu","Chowdary","Varma","Krishnan","Subramanian","Raghavan","Balakrishnan","Thomas","Jacob","Kurian",
];

const DEPARTMENTS = [
  "Computer Science","Information Science","Electronics & Communication","Mechanical",
  "Civil","Electrical","Artificial Intelligence & ML","Data Science","Biotechnology",
  "Chemical","Aeronautical","Industrial Engineering","MBA","MCA","Commerce","Architecture",
];

const COLLEGE_SEEDS: [string, string, string, string][] = [
  ["National Institute of Technology Karnataka","NITK","Surathkal","Karnataka"],
  ["Manipal Institute of Technology","MIT Manipal","Manipal","Karnataka"],
  ["RV College of Engineering","RVCE","Bengaluru","Karnataka"],
  ["BMS College of Engineering","BMSCE","Bengaluru","Karnataka"],
  ["PES University","PESU","Bengaluru","Karnataka"],
  ["MS Ramaiah Institute of Technology","MSRIT","Bengaluru","Karnataka"],
  ["Dayananda Sagar College of Engineering","DSCE","Bengaluru","Karnataka"],
  ["BNM Institute of Technology","BNMIT","Bengaluru","Karnataka"],
  ["Sahyadri College of Engineering","SCEM","Mangaluru","Karnataka"],
  ["St Joseph Engineering College","SJEC","Mangaluru","Karnataka"],
  ["Canara Engineering College","CEC","Mangaluru","Karnataka"],
  ["NMAM Institute of Technology","NMAMIT","Nitte","Karnataka"],
  ["Manipal Academy of Higher Education","MAHE","Manipal","Karnataka"],
  ["JSS Science and Technology University","JSSSTU","Mysuru","Karnataka"],
  ["Siddaganga Institute of Technology","SIT","Tumakuru","Karnataka"],
  ["KLE Technological University","KLETU","Hubballi","Karnataka"],
  ["BVB College of Engineering","BVB","Hubballi","Karnataka"],
  ["Gogte Institute of Technology","GIT","Belagavi","Karnataka"],
  ["Indian Institute of Technology Madras","IIT Madras","Chennai","Tamil Nadu"],
  ["Anna University","Anna Univ","Chennai","Tamil Nadu"],
  ["SSN College of Engineering","SSN","Chennai","Tamil Nadu"],
  ["PSG College of Technology","PSG Tech","Coimbatore","Tamil Nadu"],
  ["Coimbatore Institute of Technology","CIT","Coimbatore","Tamil Nadu"],
  ["Thiagarajar College of Engineering","TCE","Madurai","Tamil Nadu"],
  ["Vellore Institute of Technology","VIT","Vellore","Tamil Nadu"],
  ["SRM Institute of Science and Technology","SRMIST","Chennai","Tamil Nadu"],
  ["Amrita Vishwa Vidyapeetham","Amrita","Coimbatore","Tamil Nadu"],
  ["College of Engineering Trivandrum","CET","Thiruvananthapuram","Kerala"],
  ["Government Engineering College Thrissur","GECT","Thrissur","Kerala"],
  ["National Institute of Technology Calicut","NITC","Kozhikode","Kerala"],
  ["Cochin University of Science and Technology","CUSAT","Kochi","Kerala"],
  ["TKM College of Engineering","TKMCE","Kollam","Kerala"],
  ["Mar Athanasius College of Engineering","MACE","Kothamangalam","Kerala"],
  ["Indian Institute of Technology Hyderabad","IIT Hyderabad","Hyderabad","Telangana"],
  ["International Institute of Information Technology Hyderabad","IIIT-H","Hyderabad","Telangana"],
  ["Osmania University","OU","Hyderabad","Telangana"],
  ["Chaitanya Bharathi Institute of Technology","CBIT","Hyderabad","Telangana"],
  ["Vasavi College of Engineering","VCE","Hyderabad","Telangana"],
  ["Andhra University","AU","Visakhapatnam","Andhra Pradesh"],
  ["Gayatri Vidya Parishad College of Engineering","GVPCE","Visakhapatnam","Andhra Pradesh"],
  ["Sri Venkateswara University","SVU","Tirupati","Andhra Pradesh"],
  ["College of Engineering Pune","COEP","Pune","Maharashtra"],
  ["Veermata Jijabai Technological Institute","VJTI","Mumbai","Maharashtra"],
  ["Indian Institute of Technology Bombay","IIT Bombay","Mumbai","Maharashtra"],
  ["Sardar Patel Institute of Technology","SPIT","Mumbai","Maharashtra"],
  ["Vishwakarma Institute of Technology","VIT Pune","Pune","Maharashtra"],
  ["Walchand College of Engineering","WCE","Sangli","Maharashtra"],
  ["Visvesvaraya National Institute of Technology","VNIT","Nagpur","Maharashtra"],
  ["Nirma University","Nirma","Ahmedabad","Gujarat"],
  ["Dharmsinh Desai University","DDU","Nadiad","Gujarat"],
  ["Sardar Vallabhbhai National Institute of Technology","SVNIT","Surat","Gujarat"],
  ["Indian Institute of Technology Delhi","IIT Delhi","New Delhi","Delhi"],
  ["Delhi Technological University","DTU","New Delhi","Delhi"],
  ["Netaji Subhas University of Technology","NSUT","New Delhi","Delhi"],
  ["Indraprastha Institute of Information Technology","IIIT Delhi","New Delhi","Delhi"],
  ["Jamia Millia Islamia","JMI","New Delhi","Delhi"],
  ["Thapar Institute of Engineering and Technology","Thapar","Patiala","Punjab"],
  ["Punjab Engineering College","PEC","Chandigarh","Chandigarh"],
  ["Indian Institute of Technology Kanpur","IIT Kanpur","Kanpur","Uttar Pradesh"],
  ["Motilal Nehru National Institute of Technology","MNNIT","Prayagraj","Uttar Pradesh"],
  ["Aligarh Muslim University","AMU","Aligarh","Uttar Pradesh"],
  ["Indian Institute of Technology Kharagpur","IIT Kharagpur","Kharagpur","West Bengal"],
  ["Jadavpur University","JU","Kolkata","West Bengal"],
  ["National Institute of Technology Durgapur","NITD","Durgapur","West Bengal"],
  ["Birla Institute of Technology Mesra","BIT Mesra","Ranchi","Jharkhand"],
  ["National Institute of Technology Rourkela","NITR","Rourkela","Odisha"],
  ["Manipal University Jaipur","MUJ","Jaipur","Rajasthan"],
  ["Malaviya National Institute of Technology","MNIT","Jaipur","Rajasthan"],
];

const EVENT_SEEDS: [string, string, number, number, number | null, number, boolean][] = [
  // title, track, minTeam, maxTeam, capacity, fee, requiresIndemnity
  ["Hackathon 36","technical",2,4,60,500,false],
  ["Codeklash","technical",1,1,200,150,false],
  ["Capture The Flag","technical",2,3,48,300,false],
  ["RoboSumo","technical",2,4,32,400,false],
  ["Line Follower","technical",2,3,40,350,false],
  ["Circuit Debugging","technical",2,2,50,150,false],
  ["Paper Presentation","technical",1,3,80,200,false],
  ["Project Expo","technical",1,4,45,300,false],
  ["Bridge It","technical",2,4,36,250,false],
  ["CAD Wars","technical",1,1,40,200,false],
  ["Data Sprint","technical",1,2,64,250,false],
  ["Pitch Perfect","technical",2,4,30,300,false],
  ["Solo Dance","cultural",1,1,60,200,false],
  ["Group Dance","cultural",6,12,20,800,false],
  ["Battle of Bands","cultural",4,8,16,1000,false],
  ["Solo Singing","cultural",1,1,80,200,false],
  ["Group Singing","cultural",4,8,20,500,false],
  ["Street Play","cultural",8,15,14,900,false],
  ["Mono Act","cultural",1,1,40,150,false],
  ["Stand-up Comedy","cultural",1,1,30,150,false],
  ["Fashion Walk","cultural",6,12,14,1200,false],
  ["Instrumental Solo","cultural",1,1,35,200,false],
  ["Beatboxing","cultural",1,1,25,150,false],
  ["Valorant","gaming",5,5,32,750,false],
  ["BGMI","gaming",4,4,48,600,false],
  ["FIFA Knockout","gaming",1,1,64,200,false],
  ["Counter Strike 2","gaming",5,5,24,750,false],
  ["Chess Blitz","gaming",1,1,64,150,false],
  ["Tekken 8","gaming",1,1,32,200,false],
  ["Debate","literary",2,2,32,200,false],
  ["JAM","literary",1,1,50,100,false],
  ["Creative Writing","literary",1,1,60,100,false],
  ["Quiz Prelims","literary",2,3,60,250,false],
  ["Model UN","literary",1,1,90,600,false],
  ["Poetry Slam","literary",1,1,40,150,false],
  ["UI/UX Sprint","design",1,2,50,250,false],
  ["Poster Design","design",1,1,60,150,false],
  ["Short Film","design",3,8,20,500,false],
  ["Photography Walk","design",1,1,45,200,false],
  ["Reel It","design",1,2,55,150,false],
  ["Futsal","sports",6,10,16,1200,true],
  ["Basketball 3v3","sports",3,5,24,600,true],
  ["Athletics Relay","sports",4,4,32,400,true],
  ["Tug of War","sports",8,10,16,500,true],
];

const VENUES = [
  "Main Auditorium","Seminar Hall A","Seminar Hall B","CS Lab 1","CS Lab 2","CS Lab 3",
  "Open Air Theatre","Amphitheatre","Mechanical Workshop","Electronics Lab","Design Studio",
  "Basketball Court","Football Ground","Athletics Track","Library Conference Room",
  "Innovation Centre","Drawing Hall","Central Quadrangle",
];

const STATIONS = ["Mangaluru Central","Mangaluru Junction","Mangaluru Airport","KSRTC Bus Stand","Surathkal"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const pad = (n: number, w: number) => String(n).padStart(w, "0");
const iso = (d: Date) => d.toISOString();
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
const addHours = (d: Date, n: number) => new Date(d.getTime() + n * 3600000);

/** Cheap non-cryptographic content hash — enough to catch a reused screenshot. */
export function cheapHash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

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
  actorId: string;
  invoiceCounter: number;
}

/**
 * "Now" for the seeded world: a week before the fest, when the registration
 * team is at peak load — payment queue deep, accommodation half-allotted,
 * documents still arriving. That is the state worth designing against.
 */
export const SEED_NOW = new Date("2026-02-05T14:30:00+05:30");

export function generateSeed(seed = 20260212): SeedData {
  const rng = makeRng(seed);
  const now = SEED_NOW;
  const festStart = new Date(FEST.startsAt);
  const regOpen = new Date(FEST.registrationOpensAt);
  const earlyBirdEnd = new Date(FEST.earlyBirdEndsAt);

  // ---- Staff -------------------------------------------------------------
  const staff: StaffMember[] = [
    ["Rhea Kamath", "head"],
    ["Aniket Deshpande", "coordinator"],
    ["Sowmya Hegde", "coordinator"],
    ["Vikram Shetty", "finance"],
    ["Nidhi Prabhu", "finance"],
    ["Karan Bhat", "desk"],
    ["Ayesha Rahman", "desk"],
    ["Tarun Pai", "desk"],
    ["Meghana Rao", "desk"],
    ["Joseph Kurian", "viewer"],
  ].map(([name, role], i) => ({
    id: `stf-${pad(i + 1, 3)}`,
    name: name as string,
    email: `${(name as string).toLowerCase().replace(/\s+/g, ".")}@aurora26.in`,
    phone: `+91 9${rng.int(100000000, 999999999)}`,
    role: role as StaffMember["role"],
    isActive: true,
    joinedAt: iso(addDays(regOpen, -rng.int(5, 40))),
  }));
  const staffIds = staff.map((s) => s.id);
  const financeIds = staff.filter((s) => s.role === "finance" || s.role === "head").map((s) => s.id);
  const deskIds = staff.filter((s) => s.role === "desk").map((s) => s.id);

  // ---- Colleges ----------------------------------------------------------
  const colleges: College[] = COLLEGE_SEEDS.map(([name, short, city, state], i) => {
    const g = rng.bool(0.5) ? FIRST_M : FIRST_F;
    const contact = `${rng.pick(g)} ${rng.pick(LAST)}`;
    const hasEscort = rng.bool(0.62);
    return {
      id: `clg-${pad(i + 1, 3)}`,
      name,
      shortName: short,
      city,
      state,
      isVerified: rng.bool(0.78),
      contactName: contact,
      contactPhone: `+91 9${rng.int(100000000, 999999999)}`,
      contactEmail: `${short.toLowerCase().replace(/[^a-z]/g, "")}.contingent@gmail.com`,
      facultyEscortName: hasEscort ? `Prof. ${rng.pick(LAST)}` : null,
      facultyEscortPhone: hasEscort ? `+91 9${rng.int(100000000, 999999999)}` : null,
    };
  });

  // ---- Events ------------------------------------------------------------
  const events: FestEvent[] = EVENT_SEEDS.map(
    ([title, track, minT, maxT, cap, fee, indem], i) => {
      const dayIdx = i % 3;
      const day = FEST.days[dayIdx].key;
      const start = addHours(addDays(festStart, dayIdx), rng.int(0, 8));
      return {
        id: `evt-${pad(i + 1, 3)}`,
        slug: title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
        title,
        track: track as FestEvent["track"],
        minTeamSize: minT,
        maxTeamSize: maxT,
        capacity: cap,
        feeInr: fee,
        venue: rng.pick(VENUES),
        day,
        startsAt: iso(start),
        endsAt: iso(addHours(start, rng.int(2, 5))),
        registrationClosesAt: FEST.registrationClosesAt,
        requiresIndemnity: indem,
        status: rng.weighted([
          ["published", 40],
          ["registration_closed", 3],
          ["cancelled", 1],
        ] as const) as FestEvent["status"],
        coordinatorName: `${rng.bool() ? rng.pick(FIRST_M) : rng.pick(FIRST_F)} ${rng.pick(LAST)}`,
        coordinatorPhone: `+91 9${rng.int(100000000, 999999999)}`,
      };
    },
  );

  // ---- Participants ------------------------------------------------------
  const PARTICIPANT_COUNT = 2400;
  const participants: Participant[] = [];
  for (let i = 0; i < PARTICIPANT_COUNT; i++) {
    const gender: Participant["gender"] = rng.weighted([
      ["male", 56],
      ["female", 43],
      ["other", 1],
    ] as const);
    const first = gender === "female" ? rng.pick(FIRST_F) : rng.pick(FIRST_M);
    const last = rng.pick(LAST);
    const college = rng.weighted(
      colleges.map((c, ci) => [c, ci < 14 ? 5 : ci < 40 ? 2.2 : 1] as const),
    );
    const category = rng.weighted([
      ["participant", 72],
      ["delegate", 14],
      ["accompanist", 6],
      ["faculty", 4],
      ["volunteer", 3],
      ["guest", 1],
    ] as const);
    // A deliberate slice of minors — the guardian-consent path must have data.
    const age = rng.weighted([
      [17, 6],
      [18, 16],
      [19, 22],
      [20, 22],
      [21, 18],
      [22, 12],
      [24, 4],
    ] as const);
    const dob = new Date(festStart.getTime() - age * 365.25 * 86400000 - rng.int(0, 300) * 86400000);
    const createdVia: Participant["createdVia"] = rng.weighted([
      ["online", 84],
      ["csv_import", 14],
      ["on_spot", 2],
    ] as const);
    // Registrations cluster near the early-bird deadline and the closing date.
    const daysIn = rng.weighted([
      [rng.int(0, 12), 12],
      [rng.int(20, 34), 30],
      [rng.int(35, 50), 18],
      [rng.int(51, 66), 40],
    ] as const);
    participants.push({
      id: `ptc-${pad(i + 1, 5)}`,
      code: `${FEST.serials.registration}-${pad(i + 1, 5)}`,
      fullName: `${first} ${last}`,
      email: `${first.toLowerCase()}.${last.toLowerCase()}${rng.int(1, 99)}@gmail.com`,
      phone: `+91 ${rng.int(70, 99)}${rng.int(10000000, 99999999)}`,
      gender,
      dateOfBirth: iso(dob).slice(0, 10),
      collegeId: college.id,
      department: rng.pick(DEPARTMENTS),
      yearOfStudy: rng.int(1, 4),
      category,
      tshirtSize: rng.weighted([
        ["XS", 3],
        ["S", 14],
        ["M", 32],
        ["L", 30],
        ["XL", 16],
        ["XXL", 5],
      ] as const),
      emergencyName: `${rng.pick(LAST)} ${rng.bool() ? "(Father)" : "(Mother)"}`,
      emergencyPhone: `+91 9${rng.int(100000000, 999999999)}`,
      dietaryPref: rng.weighted([
        ["veg", 58],
        ["non_veg", 36],
        ["vegan", 3],
        ["jain", 3],
      ] as const),
      notes: null,
      createdAt: iso(addDays(regOpen, daysIn)),
      createdVia,
      isBlocked: rng.bool(0.004),
    });
  }

  // A handful of deliberate near-duplicates, so the merge worklist has real
  // work in it — this is what a CSV import from a college actually produces.
  for (let i = 0; i < 14; i++) {
    const src = participants[rng.int(0, 400)];
    const idx = participants.length;
    participants.push({
      ...src,
      id: `ptc-${pad(idx + 1, 5)}`,
      code: `${FEST.serials.registration}-${pad(idx + 1, 5)}`,
      // Same person, entered twice: casing/spacing differs, phone identical.
      fullName: src.fullName.toUpperCase(),
      email: src.email.replace("@gmail.com", "@outlook.com"),
      createdVia: "csv_import",
      createdAt: iso(addDays(new Date(src.createdAt), rng.int(1, 9))),
    });
  }

  // ---- Registrations + teams --------------------------------------------
  const registrations: Registration[] = [];
  const teams: Team[] = [];
  const perEventCount = new Map<string, number>();
  let regNo = 0;

  const publishedEvents = events.filter((e) => e.status !== "cancelled");
  const soloEvents = publishedEvents.filter((e) => e.maxTeamSize === 1);
  const teamEvents = publishedEvents.filter((e) => e.maxTeamSize > 1);

  // Team events first, so rosters are coherent people from one college.
  for (const ev of teamEvents) {
    const cap = ev.capacity ?? 40;
    const teamCount = Math.max(3, Math.round(cap * rng.weighted([[0.5, 3], [0.85, 5], [1.15, 2]] as const)));
    for (let t = 0; t < teamCount; t++) {
      const college = rng.pick(colleges);
      const pool = participants.filter(
        (p) => p.collegeId === college.id && p.category === "participant" && !p.isBlocked,
      );
      if (pool.length < ev.minTeamSize) continue;
      const size = Math.min(pool.length, rng.int(ev.minTeamSize, ev.maxTeamSize));
      const members = rng.shuffle(pool).slice(0, size);
      // Some teams are deliberately short — the incomplete-team alert needs data.
      const roster = rng.bool(0.06) ? members.slice(0, Math.max(1, ev.minTeamSize - 1)) : members;

      const teamId = `tm-${pad(teams.length + 1, 4)}`;
      const already = perEventCount.get(ev.id) ?? 0;
      const overCapacity = ev.capacity != null && already + roster.length > ev.capacity;

      teams.push({
        id: teamId,
        eventId: ev.id,
        name: `${college.shortName} ${rng.pick(["Titans","Vipers","Nova","Eclipse","Vortex","Rangers","Phoenix","Zenith","Cipher","Mavericks","Rebels","Falcons"])}`,
        joinCode: `${college.shortName.replace(/[^A-Z]/g, "").slice(0, 3) || "AUR"}${rng.int(100, 999)}`,
        leaderParticipantId: roster[0].id,
        memberIds: roster.map((m) => m.id),
        isLocked: rng.bool(0.3),
        createdAt: iso(addDays(regOpen, rng.int(10, 60))),
      });

      for (const m of roster) {
        if (registrations.some((r) => r.eventId === ev.id && r.participantId === m.id)) continue;
        regNo++;
        const status: Registration["status"] = overCapacity
          ? "waitlisted"
          : rng.weighted([
              ["confirmed", 62],
              ["pending", 28],
              ["cancelled", 6],
              ["rejected", 2],
              ["waitlisted", 2],
            ] as const);
        const registeredAt = iso(addDays(new Date(m.createdAt), rng.int(0, 6)));
        registrations.push({
          id: `reg-${pad(regNo, 5)}`,
          code: `R${pad(regNo, 6)}`,
          participantId: m.id,
          eventId: ev.id,
          teamId,
          status,
          waitlistPosition: status === "waitlisted" ? (perEventCount.get(ev.id) ?? 0) % 25 : null,
          feeInr: ev.feeInr,
          registeredAt,
          confirmedAt: status === "confirmed" ? iso(addDays(new Date(registeredAt), rng.int(0, 4))) : null,
          cancelledAt: status === "cancelled" ? iso(addDays(new Date(registeredAt), rng.int(1, 20))) : null,
          cancelReason: status === "cancelled" ? rng.pick(["withdrawal", "duplicate", "clash", "unpaid"]) : null,
          source: m.createdVia,
          notes: null,
        });
        if (status === "confirmed" || status === "pending")
          perEventCount.set(ev.id, (perEventCount.get(ev.id) ?? 0) + 1);
      }
    }
  }

  // Solo events.
  for (const p of participants) {
    if (p.category === "faculty" || p.category === "volunteer" || p.category === "guest") continue;
    if (p.category === "delegate") continue;
    const n = rng.weighted([[0, 8], [1, 34], [2, 32], [3, 18], [4, 8]] as const);
    const chosen = rng.shuffle(soloEvents).slice(0, n);
    for (const ev of chosen) {
      if (registrations.some((r) => r.eventId === ev.id && r.participantId === p.id)) continue;
      const already = perEventCount.get(ev.id) ?? 0;
      const full = ev.capacity != null && already >= ev.capacity;
      regNo++;
      const status: Registration["status"] = full
        ? "waitlisted"
        : rng.weighted([
            ["confirmed", 60],
            ["pending", 30],
            ["cancelled", 6],
            ["rejected", 2],
            ["waitlisted", 2],
          ] as const);
      const registeredAt = iso(addDays(new Date(p.createdAt), rng.int(0, 5)));
      registrations.push({
        id: `reg-${pad(regNo, 5)}`,
        code: `R${pad(regNo, 6)}`,
        participantId: p.id,
        eventId: ev.id,
        teamId: null,
        status,
        waitlistPosition: status === "waitlisted" ? already - (ev.capacity ?? 0) + 1 : null,
        feeInr: ev.feeInr,
        registeredAt,
        confirmedAt: status === "confirmed" ? iso(addDays(new Date(registeredAt), rng.int(0, 3))) : null,
        cancelledAt: status === "cancelled" ? iso(addDays(new Date(registeredAt), rng.int(1, 18))) : null,
        cancelReason: status === "cancelled" ? rng.pick(["withdrawal", "duplicate", "clash", "unpaid"]) : null,
        source: p.createdVia,
        notes: null,
      });
      if (status === "confirmed" || status === "pending")
        perEventCount.set(ev.id, (perEventCount.get(ev.id) ?? 0) + 1);
    }
  }

  // ---- Substitution requests ---------------------------------------------
  const substitutions: SubstitutionRequest[] = [];
  for (let i = 0; i < 26; i++) {
    const team = rng.pick(teams);
    if (!team || team.memberIds.length < 2) continue;
    const out = rng.pick(team.memberIds);
    const pool = participants.filter((p) => !team.memberIds.includes(p.id));
    const inP = rng.pick(pool);
    const status = rng.weighted([["pending", 5], ["approved", 3], ["rejected", 1]] as const);
    substitutions.push({
      id: `sub-${pad(i + 1, 3)}`,
      teamId: team.id,
      outParticipantId: out,
      inParticipantId: inP.id,
      reason: rng.pick([
        "Illness — medical certificate attached",
        "Semester exam clash",
        "Visa/travel issue",
        "Injury during practice",
        "Personal emergency",
      ]),
      status,
      requestedAt: iso(addDays(now, -rng.int(1, 14))),
      reviewedBy: status === "pending" ? null : rng.pick(staffIds),
      reviewedAt: status === "pending" ? null : iso(addDays(now, -rng.int(0, 5))),
    });
  }

  // ---- Payments ----------------------------------------------------------
  const payments: Payment[] = [];
  const usedUtrs = new Set<string>();
  let invoiceCounter = 0;

  const byParticipant = new Map<string, Registration[]>();
  for (const r of registrations) {
    if (r.status === "cancelled" || r.status === "rejected") continue;
    const arr = byParticipant.get(r.participantId) ?? [];
    arr.push(r);
    byParticipant.set(r.participantId, arr);
  }

  const collegeCounts = new Map<string, number>();
  for (const p of participants) collegeCounts.set(p.collegeId, (collegeCounts.get(p.collegeId) ?? 0) + 1);

  let payNo = 0;
  for (const p of participants) {
    const regs = byParticipant.get(p.id) ?? [];
    const cat = CATEGORIES.find((c) => c.id === p.category)!;
    if (regs.length === 0 && cat.baseFee === 0) continue;
    // ~11% simply never pay — that IS the outstanding-dues module's dataset.
    if (rng.bool(0.11)) continue;

    const breakdown: FeeLine[] = [];
    if (cat.baseFee > 0) breakdown.push({ label: `${cat.label} pass`, kind: "base", refId: null, amount: cat.baseFee });
    for (const r of regs) {
      const ev = events.find((e) => e.id === r.eventId)!;
      if (ev.feeInr > 0) breakdown.push({ label: ev.title, kind: "event", refId: r.id, amount: ev.feeInr });
    }
    if (breakdown.length === 0) continue;

    const paidAt = addDays(new Date(p.createdAt), rng.int(0, 7));
    if (paidAt < earlyBirdEnd && cat.baseFee > 0) {
      const disc = Math.round((cat.baseFee * FEES.earlyBirdDiscountPct) / 100);
      breakdown.push({ label: "Early bird", kind: "discount", refId: null, amount: -disc });
    }
    if ((collegeCounts.get(p.collegeId) ?? 0) >= FEES.groupDiscountMinSize && rng.bool(0.45)) {
      const sub = breakdown.filter((b) => b.amount > 0).reduce((s, b) => s + b.amount, 0);
      breakdown.push({
        label: "Contingent discount",
        kind: "discount",
        refId: null,
        amount: -Math.round((sub * FEES.groupDiscountPct) / 100),
      });
    }
    if (p.createdVia === "on_spot") {
      breakdown.push({ label: "On-spot surcharge", kind: "surcharge", refId: null, amount: FEES.onSpotSurcharge });
    }

    const amount = breakdown.reduce((s, b) => s + b.amount, 0);
    if (amount <= 0) continue;

    payNo++;
    const method = rng.weighted([
      ["upi", 62],
      ["neft", 14],
      ["gateway", 16],
      ["cash", 8],
    ] as const);
    const needsUtr = PAYMENT_METHODS.find((m) => m.id === method)!.needsUtr;
    let utr: string | null = null;
    if (needsUtr) {
      do {
        utr = `${rng.int(100000000000, 999999999999)}`;
      } while (usedUtrs.has(utr));
      usedUtrs.add(utr);
    }

    // Payments made close to "now" are still queued — that is what gives the
    // verification queue its realistic ageing spread.
    const hoursAgo = (now.getTime() - paidAt.getTime()) / 3600000;
    const status = rng.weighted(
      hoursAgo < 60
        ? ([
            ["pending", 60],
            ["verified", 33],
            ["rejected", 7],
          ] as const)
        : ([
            ["verified", 88],
            ["pending", 5],
            ["rejected", 5],
            ["refunded", 2],
          ] as const),
    ) as Payment["status"];

    const reviewedBy = status === "pending" ? null : rng.pick(financeIds);
    const receiptData = method === "cash" ? null : `data:seed/${cheapHash(`${p.id}-${payNo}`)}`;

    payments.push({
      id: `pay-${pad(payNo, 5)}`,
      invoiceSerial: status === "verified" ? `${FEST.serials.invoice}/${pad(++invoiceCounter, 5)}` : null,
      participantId: p.id,
      registrationIds: regs.map((r) => r.id),
      method,
      utr,
      amount,
      breakdown,
      status,
      receiptData,
      receiptFileName: receiptData ? `receipt-${p.code}.jpg` : null,
      receiptHash: receiptData ? cheapHash(receiptData) : null,
      submittedAt: iso(paidAt),
      reviewedBy,
      reviewedAt: reviewedBy ? iso(addHours(paidAt, rng.int(2, 70))) : null,
      reviewNote:
        status === "rejected"
          ? rng.pick([
              "Screenshot unreadable — please re-upload",
              "UTR does not match any bank credit",
              "Amount short by ₹150",
              "Receipt belongs to a different participant",
            ])
          : null,
      deskShiftId: null,
      fraudFlags: [],
    });
  }

  // Deliberate fraud cases — the review lane must not be empty on first load.
  const fraudTargets = rng.shuffle(payments.filter((p) => p.utr)).slice(0, 9);
  for (let i = 0; i < fraudTargets.length; i += 3) {
    const victim = fraudTargets[i];
    const copycat = fraudTargets[i + 1];
    if (victim && copycat) copycat.utr = victim.utr; // reused UTR
    const hashDup = fraudTargets[i + 2];
    if (victim && hashDup) hashDup.receiptHash = victim.receiptHash; // reused screenshot
  }

  // ---- Refunds -----------------------------------------------------------
  const refunds: Refund[] = [];
  const cancelledEvent = events.find((e) => e.status === "cancelled");
  const refundable = rng.shuffle(payments.filter((p) => p.status === "verified")).slice(0, 34);
  refundable.forEach((p, i) => {
    const status = rng.weighted([
      ["requested", 4],
      ["approved", 3],
      ["paid", 5],
      ["rejected", 1],
    ] as const);
    const reqAt = addDays(now, -rng.int(1, 25));
    refunds.push({
      id: `rfd-${pad(i + 1, 4)}`,
      serial: `${FEST.serials.refund}/${pad(i + 1, 4)}`,
      paymentId: p.id,
      participantId: p.participantId,
      amount: Math.round(p.amount * rng.weighted([[1, 5], [0.5, 3], [0.25, 1]] as const)),
      reasonCode: cancelledEvent && rng.bool(0.3)
        ? "event_cancelled"
        : rng.pick(["withdrawal", "duplicate_payment", "overcharge", "other"] as const),
      reasonNote: null,
      status,
      requestedBy: rng.pick(staffIds),
      requestedAt: iso(reqAt),
      approvedBy: status === "requested" ? null : rng.pick(financeIds),
      approvedAt: status === "requested" ? null : iso(addDays(reqAt, rng.int(1, 4))),
      paidAt: status === "paid" ? iso(addDays(reqAt, rng.int(4, 9))) : null,
      payoutRef: status === "paid" ? `${rng.int(100000000000, 999999999999)}` : null,
    });
  });

  // ---- Settlements (bank statement) --------------------------------------
  const settlements: Settlement[] = [];
  const bankable = payments.filter((p) => p.utr && p.status !== "rejected");
  rng.shuffle(bankable)
    .slice(0, Math.floor(bankable.length * 0.9)) // 10% not yet in the statement
    .forEach((p, i) => {
      // A few land with the wrong amount — that is the reconciliation worklist.
      const drift = rng.bool(0.03) ? rng.pick([-50, 50, -100, 100]) : 0;
      settlements.push({
        id: `stl-${pad(i + 1, 5)}`,
        bankRef: p.utr!,
        amount: p.amount + drift,
        valueDate: p.submittedAt.slice(0, 10),
        narration: `UPI/${p.utr}/AURORA26/${p.participantId.toUpperCase()}`,
        matchedPaymentId: drift === 0 ? p.id : null,
        matchConfidence: drift === 0 ? "exact" : "none",
        importedAt: iso(addDays(now, -2)),
      });
    });
  // Credits with no matching app record — donations, wrong references, etc.
  for (let i = 0; i < 12; i++) {
    settlements.push({
      id: `stl-x${pad(i + 1, 3)}`,
      bankRef: `${rng.int(100000000000, 999999999999)}`,
      amount: rng.int(1, 12) * 250,
      valueDate: iso(addDays(now, -rng.int(1, 30))).slice(0, 10),
      narration: `NEFT/UNIDENTIFIED/${rng.pick(["CONTINGENT", "SPONSOR", "MISC"])}`,
      matchedPaymentId: null,
      matchConfidence: "none",
      importedAt: iso(addDays(now, -2)),
    });
  }

  // ---- Coupons -----------------------------------------------------------
  const coupons: Coupon[] = [
    { id: "cpn-001", code: "AURORAEARLY", kind: "percent", value: 20, maxUses: 500, usedCount: 383, expiresAt: FEST.earlyBirdEndsAt, isActive: false, appliesTo: "all" },
    { id: "cpn-002", code: "CONTINGENT15", kind: "percent", value: 15, maxUses: 200, usedCount: 96, expiresAt: null, isActive: true, appliesTo: "all" },
    { id: "cpn-003", code: "DELEGATE100", kind: "flat", value: 100, maxUses: 150, usedCount: 41, expiresAt: null, isActive: true, appliesTo: "delegate" },
    { id: "cpn-004", code: "ALUMNI25", kind: "percent", value: 25, maxUses: 50, usedCount: 50, expiresAt: null, isActive: false, appliesTo: "all" },
  ];

  // ---- Documents ---------------------------------------------------------
  const documents: DocumentSubmission[] = [];
  let docNo = 0;
  for (const p of participants) {
    const cat = CATEGORIES.find((c) => c.id === p.category)!;
    const required = [...cat.requiredDocs] as string[];
    const age = (festStart.getTime() - new Date(p.dateOfBirth).getTime()) / (365.25 * 86400000);
    if (age < 18) required.push("guardian_consent");
    const hasSportsReg = registrations.some(
      (r) => r.participantId === p.id && events.find((e) => e.id === r.eventId)?.requiresIndemnity,
    );
    if (hasSportsReg) required.push("indemnity");

    for (const d of required) {
      // ~18% simply have not uploaded yet — the completeness matrix needs gaps.
      if (rng.bool(0.18)) continue;
      docNo++;
      const status = rng.weighted([
        ["approved", 68],
        ["pending", 22],
        ["rejected", 5],
        ["resubmit", 5],
      ] as const);
      const submittedAt = addDays(new Date(p.createdAt), rng.int(0, 12));
      documents.push({
        id: `doc-${pad(docNo, 5)}`,
        participantId: p.id,
        docType: d as DocumentSubmission["docType"],
        fileName: `${d}-${p.code}.pdf`,
        fileData: null,
        status,
        submittedAt: iso(submittedAt),
        reviewedBy: status === "pending" ? null : rng.pick(staffIds),
        reviewedAt: status === "pending" ? null : iso(addHours(submittedAt, rng.int(4, 90))),
        reviewNote:
          status === "rejected" || status === "resubmit"
            ? rng.pick(["Photo blurred", "Expired document", "Name mismatch with registration", "Signature missing"])
            : null,
      });
    }
  }

  // ---- Accommodation -----------------------------------------------------
  const accommodation: AccommodationRequest[] = [];
  const allotments: RoomAllotment[] = [];
  const mealCoupons: MealCoupon[] = [];

  // Out-station participants are the ones who need beds.
  const outstation = participants.filter((p) => {
    const c = colleges.find((cc) => cc.id === p.collegeId);
    return c && c.city !== FEST.city.split(",")[0];
  });
  const needBeds = rng.shuffle(outstation).slice(0, 640);

  const bedCursor = new Map<string, { floor: number; room: number; bed: number }>();
  HOSTEL_BLOCKS.forEach((b) => bedCursor.set(b.id, { floor: 1, room: 1, bed: 1 }));

  needBeds.forEach((p, i) => {
    const nights = rng.weighted([
      [["d1", "d2", "d3"], 6],
      [["d1", "d2"], 3],
      [["d2", "d3"], 2],
    ] as const) as unknown as string[];
    const status = rng.weighted([
      ["requested", 4],
      ["allotted", 5],
      ["checked_in", 1],
      ["cancelled", 0.4],
    ] as const);
    const reqId = `acc-${pad(i + 1, 4)}`;
    accommodation.push({
      id: reqId,
      participantId: p.id,
      nights: [...nights],
      gender: p.gender,
      specialNeeds: rng.bool(0.05)
        ? rng.pick(["Ground floor — knee injury", "Requires wheelchair access", "Severe dust allergy"])
        : null,
      status,
      requestedAt: iso(addDays(new Date(p.createdAt), rng.int(0, 10))),
      amount: nights.length * FEES.accommodationPerNight,
    });

    if (status === "allotted" || status === "checked_in") {
      // Spill into the next matching block once one fills, or two of the five
      // hostels would sit permanently empty and the occupancy board would be
      // a lie.
      const candidates = HOSTEL_BLOCKS.filter(
        (b) => b.gender === p.gender || b.gender === "any",
      );
      let block: (typeof HOSTEL_BLOCKS)[number] | undefined;
      for (const b of candidates) {
        const c = bedCursor.get(b.id)!;
        if (c.bed > b.bedsPerRoom) {
          c.bed = 1;
          c.room++;
        }
        if (c.room > b.roomsPerFloor) {
          c.room = 1;
          c.floor++;
        }
        if (c.floor <= b.floors) {
          block = b;
          break;
        }
      }
      if (!block) return;
      const cur = bedCursor.get(block.id)!;

      const allottedAt = addDays(now, -rng.int(0, 8));
      allotments.push({
        id: `alt-${pad(allotments.length + 1, 4)}`,
        requestId: reqId,
        participantId: p.id,
        blockId: block.id,
        roomNo: `${cur.floor}${pad(cur.room, 2)}`,
        bedNo: cur.bed,
        allottedBy: rng.pick(staffIds),
        allottedAt: iso(allottedAt),
        checkedInAt: status === "checked_in" ? iso(addHours(allottedAt, rng.int(1, 40))) : null,
        checkedOutAt: null,
        keyIssued: status === "checked_in",
        beddingIssued: status === "checked_in",
        itemsReturned: false,
      });
      cur.bed++;

      for (const day of nights) {
        for (const meal of ["breakfast", "lunch", "dinner"]) {
          mealCoupons.push({
            id: `mc-${mealCoupons.length + 1}`,
            participantId: p.id,
            day,
            meal,
            issuedAt: iso(allottedAt),
            redeemedAt: null,
          });
        }
      }
    }
  });

  // ---- Travel ------------------------------------------------------------
  const pickupSlots: PickupSlot[] = [];
  for (let d = 0; d < 2; d++) {
    for (let s = 0; s < 5; s++) {
      const start = addHours(addDays(festStart, d - 1), 6 + s * 3);
      pickupSlots.push({
        id: `pks-${pad(pickupSlots.length + 1, 3)}`,
        station: rng.pick(STATIONS),
        windowStart: iso(start),
        windowEnd: iso(addHours(start, 3)),
        vehicle: rng.pick(["Tempo Traveller KA-19-8842", "Bus KA-19-A-1120", "Bus KA-19-B-3390", "Innova KA-20-M-7781"]),
        capacity: rng.pick([12, 18, 32, 45]),
        driverName: `${rng.pick(FIRST_M)} ${rng.pick(LAST)}`,
        driverPhone: `+91 9${rng.int(100000000, 999999999)}`,
        volunteerStaffId: rng.bool(0.7) ? rng.pick(deskIds) : null,
        status: rng.weighted([["planned", 7], ["dispatched", 2], ["completed", 1]] as const),
      });
    }
  }

  const travel: TravelRecord[] = [];
  rng.shuffle(outstation)
    .slice(0, 780)
    .forEach((p, i) => {
      const mode = rng.weighted([["train", 52], ["bus", 26], ["flight", 14], ["own", 8]] as const);
      const needsPickup = mode !== "own" && rng.bool(0.72);
      const arrAt = addHours(addDays(festStart, -1), rng.int(2, 22));
      travel.push({
        id: `trv-${pad(i * 2 + 1, 5)}`,
        participantId: p.id,
        direction: "arrival",
        mode,
        serviceRef:
          mode === "train"
            ? `${rng.int(12000, 22999)}`
            : mode === "flight"
              ? `${rng.pick(["6E", "AI", "SG", "UK"])}-${rng.int(100, 999)}`
              : null,
        station: mode === "flight" ? "Mangaluru Airport" : rng.pick(STATIONS),
        scheduledAt: iso(arrAt),
        pickupSlotId: needsPickup && rng.bool(0.75) ? rng.pick(pickupSlots).id : null,
        needsPickup,
        status: rng.weighted([["expected", 8], ["arrived", 1], ["picked_up", 1]] as const),
      });
      if (rng.bool(0.8)) {
        const depAt = addHours(addDays(festStart, 3), rng.int(2, 20));
        travel.push({
          id: `trv-${pad(i * 2 + 2, 5)}`,
          participantId: p.id,
          direction: "departure",
          mode,
          serviceRef: mode === "train" ? `${rng.int(12000, 22999)}` : null,
          station: mode === "flight" ? "Mangaluru Airport" : rng.pick(STATIONS),
          scheduledAt: iso(depAt),
          pickupSlotId: null,
          needsPickup: false,
          status: "expected",
        });
      }
    });

  // ---- Attendance / kits / desk ------------------------------------------
  // "Now" is pre-fest, so attendance is a small pre-registration desk trickle.
  const attendance: Attendance[] = [];
  const earlyArrivals = rng.shuffle(participants).slice(0, 168);
  earlyArrivals.forEach((p, i) => {
    attendance.push({
      id: `att-${pad(i + 1, 5)}`,
      participantId: p.id,
      eventId: null,
      registrationId: null,
      method: rng.weighted([["qr", 8], ["manual", 2]] as const),
      checkedInAt: iso(addHours(now, -rng.int(0, 30))),
      scannedBy: rng.pick(deskIds),
      day: "d1",
    });
  });

  const kits: KitIssue[] = earlyArrivals.slice(0, 96).map((p, i) => ({
    id: `kit-${pad(i + 1, 4)}`,
    participantId: p.id,
    tshirtSize: p.tshirtSize,
    items: ["T-shirt", "ID lanyard", "Event booklet", "Tote bag"],
    issuedAt: iso(addHours(now, -rng.int(0, 28))),
    issuedBy: rng.pick(deskIds),
    signature: true,
  }));

  const shifts: DeskShift[] = [];
  for (let d = 0; d < 4; d++) {
    for (let s = 0; s < 2; s++) {
      const start = addHours(addDays(now, d - 2), 9 + s * 6);
      const isCurrent = d === 2 && s === 0;
      const expected = rng.int(4, 30) * 350;
      const closed = start < now && !isCurrent;
      shifts.push({
        id: `shf-${pad(shifts.length + 1, 3)}`,
        staffId: deskIds[(d + s) % deskIds.length],
        deskName: s === 0 ? "Main Gate Desk" : "Admin Block Desk",
        day: FEST.days[Math.min(2, d)].key,
        startsAt: iso(start),
        endsAt: iso(addHours(start, 6)),
        status: closed ? "closed" : isCurrent ? "open" : "scheduled",
        openingFloat: 2000,
        expectedCash: closed || isCurrent ? expected : 0,
        // Small variances — a drawer that always balances teaches nothing.
        countedCash: closed ? expected + rng.weighted([[0, 6], [-50, 1], [100, 1]] as const) : null,
        handoverTo: closed ? rng.pick(deskIds) : null,
        closedAt: closed ? iso(addHours(start, 6)) : null,
      });
    }
  }

  const tokens: QueueToken[] = [];
  for (let i = 0; i < 42; i++) {
    const issued = addHours(now, -rng.int(0, 5));
    const served = rng.bool(0.72);
    tokens.push({
      id: `tok-${pad(i + 1, 4)}`,
      number: 100 + i,
      deskName: rng.pick(["Main Gate Desk", "Admin Block Desk"]),
      issuedAt: iso(issued),
      servedAt: served ? iso(addHours(issued, rng.int(1, 25) / 60)) : null,
      purpose: rng.weighted([["walk_in", 5], ["payment", 3], ["query", 2], ["kit", 2]] as const),
    });
  }

  // ---- Communications ----------------------------------------------------
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
    { id: "bc-001", templateId: "tpl-002", name: "Unpaid > 7 days — Jan sweep", audience: { paymentStatus: ["pending"] }, audienceCount: 412, channel: "whatsapp", status: "sent", scheduledAt: null, sentAt: iso(addDays(now, -9)), sentCount: 405, failedCount: 7, createdBy: staff[1].id },
    { id: "bc-002", templateId: "tpl-003", name: "Docs pending reminder", audience: { docsComplete: false }, audienceCount: 288, channel: "email", status: "sent", scheduledAt: null, sentAt: iso(addDays(now, -4)), sentCount: 288, failedCount: 0, createdBy: staff[2].id },
    { id: "bc-003", templateId: "tpl-004", name: "Gate brief — all confirmed", audience: { status: ["confirmed"] }, audienceCount: 1864, channel: "sms", status: "scheduled", scheduledAt: iso(addDays(festStart, -1)), sentAt: null, sentCount: 0, failedCount: 0, createdBy: staff[0].id },
    { id: "bc-004", templateId: "tpl-005", name: "Hostel allotment notice", audience: {}, audienceCount: 361, channel: "whatsapp", status: "draft", scheduledAt: null, sentAt: null, sentCount: 0, failedCount: 0, createdBy: staff[1].id },
  ];

  const messageLogs: MessageLog[] = [];
  for (const bc of broadcasts.filter((b) => b.status === "sent")) {
    const sample = rng.shuffle(participants).slice(0, Math.min(120, bc.audienceCount));
    sample.forEach((p, i) => {
      messageLogs.push({
        id: `msg-${bc.id}-${i}`,
        broadcastId: bc.id,
        participantId: p.id,
        channel: bc.channel,
        subject: templates.find((t) => t.id === bc.templateId)?.subject ?? null,
        status: rng.weighted([["delivered", 88], ["sent", 6], ["bounced", 4], ["failed", 2]] as const),
        sentAt: bc.sentAt!,
        error: null,
      });
    });
  }

  // ---- Certificates ------------------------------------------------------
  const certificates: CertificateIssue[] = [];

  // ---- Helpdesk ----------------------------------------------------------
  const TICKET_SEEDS: [HelpdeskTicket["category"], string][] = [
    ["payment_not_reflected", "Paid via UPI on 28 Jan, still showing unpaid"],
    ["name_correction", "Name spelt 'Shreyas' instead of 'Shreya' on badge"],
    ["wrong_event", "Registered for Codeklash, wanted Data Sprint"],
    ["accommodation", "Need ground-floor room — knee injury"],
    ["travel", "Train delayed by 6h, will miss the 8am pickup"],
    ["lost_badge", "Lost lanyard between hostel and main gate"],
    ["payment_not_reflected", "Bank debited twice for the same registration"],
    ["accommodation", "Requesting to be roomed with my contingent"],
    ["other", "Can a faculty escort attend without registering?"],
    ["wrong_event", "Team member registered under the wrong team code"],
    ["name_correction", "College name shows old abbreviation"],
    ["travel", "Flight lands 2am — is the desk open?"],
    ["payment_not_reflected", "Paid ₹850 but portal shows ₹700 due"],
    ["other", "Do we need to carry our own bedding?"],
    ["lost_badge", "Badge QR not scanning at the gate"],
    ["accommodation", "Allotted a male block, I am female — urgent"],
  ];
  const tickets: HelpdeskTicket[] = TICKET_SEEDS.map(([category, subject], i) => {
    const createdAt = addHours(now, -rng.int(1, 260));
    const status = rng.weighted([
      ["open", 5],
      ["in_progress", 3],
      ["waiting", 2],
      ["resolved", 5],
      ["closed", 2],
    ] as const);
    const resolved = status === "resolved" || status === "closed";
    return {
      id: `tkt-${pad(i + 1, 4)}`,
      code: `HD-${pad(i + 1, 4)}`,
      participantId: rng.pick(participants).id,
      category,
      subject,
      body: subject,
      priority: category === "payment_not_reflected" || subject.includes("urgent")
        ? rng.pick(["high", "urgent"] as const)
        : rng.pick(["low", "normal", "normal"] as const),
      status,
      assignedTo: status === "open" ? null : rng.pick(staffIds),
      createdAt: iso(createdAt),
      updatedAt: iso(addHours(createdAt, rng.int(1, 40))),
      resolvedAt: resolved ? iso(addHours(createdAt, rng.int(2, 60))) : null,
      resolutionNote: resolved ? "Resolved and confirmed with the participant." : null,
    };
  });

  // ---- Saved views + announcements ---------------------------------------
  const views: SavedView[] = [
    { id: "vw-001", name: "Unpaid > 7 days", scope: "registrations", filters: { paymentStatus: ["pending"] }, createdBy: staff[0].id, isShared: true },
    { id: "vw-002", name: "Docs incomplete", scope: "registrations", filters: { docsComplete: false }, createdBy: staff[1].id, isShared: true },
    { id: "vw-003", name: "Waitlisted — all events", scope: "registrations", filters: { status: ["waitlisted"] }, createdBy: staff[1].id, isShared: false },
    { id: "vw-004", name: "On-spot registrations", scope: "registrations", filters: { source: ["on_spot"] }, createdBy: staff[5].id, isShared: true },
    { id: "vw-005", name: "Flagged payments", scope: "payments", filters: { flaggedOnly: true }, createdBy: staff[3].id, isShared: true },
  ];

  const announcements: Announcement[] = [
    { id: "ann-001", title: "Registration closes 8 Feb, 11:59 PM", body: "No extensions this year. On-spot registration will be available at the Main Gate Desk with a ₹100 surcharge.", severity: "warning", publishedAt: iso(addDays(now, -2)), expiresAt: FEST.registrationClosesAt, createdBy: staff[0].id },
    { id: "ann-002", title: "Hostel allotment round 2 published", body: "361 beds allotted. Remaining requests will be processed after payment verification clears.", severity: "info", publishedAt: iso(addDays(now, -1)), expiresAt: null, createdBy: staff[1].id },
    { id: "ann-003", title: "Fashion Walk cancelled", body: "The event has been cancelled due to insufficient registrations. Full refunds are being processed automatically.", severity: "critical", publishedAt: iso(addDays(now, -3)), expiresAt: null, createdBy: staff[0].id },
  ];

  // ---- Audit trail -------------------------------------------------------
  const audit: AuditEvent[] = [];
  const verifiedSample = rng.shuffle(payments.filter((p) => p.reviewedAt)).slice(0, 240);
  verifiedSample.forEach((p, i) => {
    const s = staff.find((x) => x.id === p.reviewedBy) ?? staff[3];
    audit.push({
      id: `aud-${pad(i + 1, 5)}`,
      actorId: s.id,
      actorName: s.name,
      action: p.status === "verified" ? "payment.verified" : "payment.rejected",
      entity: "payment",
      entityId: p.id,
      before: { status: "pending" },
      after: { status: p.status },
      at: p.reviewedAt!,
      note: p.reviewNote,
    });
  });
  rng.shuffle(allotments).slice(0, 120).forEach((a, i) => {
    const s = staff.find((x) => x.id === a.allottedBy) ?? staff[1];
    audit.push({
      id: `aud-b${pad(i + 1, 5)}`,
      actorId: s.id,
      actorName: s.name,
      action: "accommodation.allotted",
      entity: "allotment",
      entityId: a.id,
      before: null,
      after: { blockId: a.blockId, roomNo: a.roomNo, bedNo: a.bedNo },
      at: a.allottedAt,
      note: null,
    });
  });
  audit.sort((a, b) => (a.at < b.at ? 1 : -1));

  return {
    colleges,
    events,
    participants,
    registrations,
    teams,
    substitutions,
    payments,
    refunds,
    settlements,
    coupons,
    documents,
    accommodation,
    allotments,
    mealCoupons,
    travel,
    pickupSlots,
    attendance,
    kits,
    shifts,
    tokens,
    templates,
    broadcasts,
    messageLogs,
    certificates,
    tickets,
    staff,
    audit,
    views,
    announcements,
    actorId: staff[0].id,
    invoiceCounter,
  };
}
