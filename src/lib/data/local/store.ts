/**
 * The in-memory store, persisted to localStorage.
 *
 * Nothing outside this folder may touch localStorage. Pages go through the
 * Repository interface, which is what makes the eventual backend swap a
 * one-file change.
 *
 * The seeded dataset is ~14k records, which is comfortably over the ~5MB
 * localStorage quota once serialised. So the store persists only *mutations*:
 * the seed is regenerated deterministically on boot (same seed → same data),
 * and a compact overlay of changed records is replayed on top. That keeps
 * writes durable across reloads without ever hitting the quota.
 */

import { generateSeed, type SeedData } from "./seed";

const OVERLAY_KEY = "aurora.overlay.v1";
const SEED_KEY = "aurora.seed.v1";

/** Every mutation is recorded as one of these and replayed on load. */
export type Patch =
  | { t: "upsert"; c: keyof SeedData; v: Record<string, unknown> }
  | { t: "delete"; c: keyof SeedData; id: string }
  | { t: "field"; c: keyof SeedData; id: string; k: string; v: unknown }
  | { t: "meta"; k: string; v: unknown };

const COLLECTION_KEYS: (keyof SeedData)[] = [
  "colleges","events","participants","registrations","teams","substitutions","payments",
  "refunds","settlements","coupons","documents","accommodation","allotments","mealCoupons",
  "travel","pickupSlots","attendance","kits","shifts","tokens","templates","broadcasts",
  "messageLogs","certificates","tickets","staff","audit","views","announcements",
];

export class Store {
  data: SeedData;
  private patches: Patch[] = [];
  private seed: number;
  private flushHandle: ReturnType<typeof setTimeout> | null = null;

  constructor(seed?: number) {
    this.seed = seed ?? this.readSeed();
    this.data = generateSeed(this.seed);
    this.replay();
  }

  private readSeed(): number {
    if (typeof window === "undefined") return 20260212;
    try {
      const s = localStorage.getItem(SEED_KEY);
      return s ? Number(s) : 20260212;
    } catch {
      return 20260212;
    }
  }

  private replay() {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(OVERLAY_KEY);
      if (!raw) return;
      const patches: Patch[] = JSON.parse(raw);
      this.patches = patches;
      for (const p of patches) this.applyPatch(p);
    } catch {
      // A corrupt overlay must not brick the console — drop it and carry on.
      try {
        localStorage.removeItem(OVERLAY_KEY);
      } catch {
        /* storage blocked */
      }
      this.patches = [];
    }
  }

  private applyPatch(p: Patch) {
    if (p.t === "meta") {
      (this.data as unknown as Record<string, unknown>)[p.k] = p.v;
      return;
    }
    const coll = this.data[p.c] as unknown as { id: string }[];
    if (!Array.isArray(coll)) return;
    if (p.t === "upsert") {
      const v = p.v as { id: string };
      const i = coll.findIndex((r) => r.id === v.id);
      if (i >= 0) coll[i] = { ...coll[i], ...v };
      else coll.push(v);
    } else if (p.t === "delete") {
      const i = coll.findIndex((r) => r.id === p.id);
      if (i >= 0) coll.splice(i, 1);
    } else if (p.t === "field") {
      const rec = coll.find((r) => r.id === p.id) as Record<string, unknown> | undefined;
      if (rec) rec[p.k] = p.v;
    }
  }

  /** Record + apply. Every repository write goes through here. */
  patch(p: Patch) {
    this.applyPatch(p);
    this.patches.push(p);
    this.scheduleFlush();
  }

  /** Batched so a bulk action of 400 rows writes localStorage once, not 400×. */
  private scheduleFlush() {
    if (typeof window === "undefined") return;
    if (this.flushHandle) return;
    this.flushHandle = setTimeout(() => {
      this.flushHandle = null;
      this.flush();
    }, 60);
  }

  flush() {
    if (typeof window === "undefined") return;
    try {
      // Compact: a record upserted 20 times only needs its final state.
      const compacted = compact(this.patches);
      this.patches = compacted;
      localStorage.setItem(OVERLAY_KEY, JSON.stringify(compacted));
      localStorage.setItem(SEED_KEY, String(this.seed));
    } catch {
      // Quota exceeded or storage blocked. The session still works in memory.
    }
  }

  reset(seed?: number) {
    this.seed = seed ?? 20260212;
    this.patches = [];
    this.data = generateSeed(this.seed);
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem(OVERLAY_KEY);
        localStorage.setItem(SEED_KEY, String(this.seed));
      } catch {
        /* ignore */
      }
    }
  }

  collection<K extends keyof SeedData>(k: K): SeedData[K] {
    return this.data[k];
  }
}

function compact(patches: Patch[]): Patch[] {
  const metas = new Map<string, Patch>();
  const byRecord = new Map<string, Patch[]>();
  const order: string[] = [];

  for (const p of patches) {
    if (p.t === "meta") {
      metas.set(p.k, p);
      continue;
    }
    const key = `${p.c}:${p.t === "upsert" ? (p.v as { id: string }).id : p.id}`;
    if (!byRecord.has(key)) {
      byRecord.set(key, []);
      order.push(key);
    }
    const list = byRecord.get(key)!;
    if (p.t === "delete") byRecord.set(key, [p]);
    else list.push(p);
  }

  const out: Patch[] = [];
  for (const key of order) out.push(...(byRecord.get(key) ?? []));
  out.push(...metas.values());
  return out;
}

// ---------------------------------------------------------------------------
// Singleton. One store per browser tab.
// ---------------------------------------------------------------------------

let instance: Store | null = null;

export function getStore(): Store {
  if (!instance) instance = new Store();
  return instance;
}

export function resetStore(seed?: number): Store {
  if (!instance) instance = new Store(seed);
  else instance.reset(seed);
  return instance;
}

export { COLLECTION_KEYS };
