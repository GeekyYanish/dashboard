/**
 * Session lifecycle.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  THIS IS NOT A SECURITY BOUNDARY.                                        │
 * │                                                                          │
 * │  The session lives in localStorage, which the page can read and write.   │
 * │  Anyone with devtools can edit the stored record and make themselves     │
 * │  Registration Head. No amount of client-side code changes that — only a  │
 * │  server the browser cannot edit does.                                    │
 * │                                                                          │
 * │  It is built this way deliberately, and it is the correct SHAPE: the     │
 * │  session contract, expiry handling and every call site are where a real  │
 * │  implementation needs them. Migration is:                                │
 * │                                                                          │
 * │    1. issue this token server-side as an httpOnly, Secure, SameSite      │
 * │       cookie instead of writing it here                                  │
 * │    2. move `assertCan()` from the repository into a server action        │
 * │    3. replace the client guards in the layouts with `middleware.ts`      │
 * │                                                                          │
 * │  Steps 2 and 3 touch no screen code.                                     │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

import type { StaffRoleId } from "../fest.config";

const KEY = "gateways.session.v1";

/** 12 hours — a fest shift plus overrun, short enough that a left-open laptop expires. */
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
/** Sliding refresh: activity inside this window of expiry extends the session. */
const REFRESH_WINDOW_MS = 60 * 60 * 1000;

export interface Session {
  staffId: string;
  name: string;
  email: string;
  role: StaffRoleId;
  roles?: StaffRoleId[];
  assignments?: { role: StaffRoleId; eventId: string | null }[];
  issuedAt: string;
  expiresAt: string;
  /** Blocks everything except /login/set-password until cleared. */
  mustChangePassword: boolean;
}

/**
 * Backing store.
 *
 * localStorage in the browser; a plain variable outside it. That keeps the auth
 * layer isomorphic — the same way crypto.ts is — so `npm test` exercises the
 * real sign-in path in Node rather than a stub. Without this the whole session
 * silently no-ops on the server and every headless mutation looks unauthorised.
 *
 * The in-memory fallback is also what makes a private-mode browser with storage
 * blocked still usable: you stay signed in for the tab, you just do not persist
 * across a reload.
 */
let memory: string | null = null;
const hasStorage = () => {
  try {
    return typeof window !== "undefined" && !!window.localStorage;
  } catch {
    return false;
  }
};

function raw(): string | null {
  if (!hasStorage()) return memory;
  try {
    return localStorage.getItem(KEY);
  } catch {
    return memory;
  }
}

function setRaw(v: string | null) {
  memory = v;
  if (!hasStorage()) return;
  try {
    if (v) localStorage.setItem(KEY, v);
    else localStorage.removeItem(KEY);
  } catch {
    /* storage blocked — the in-memory copy above still holds */
  }
}

function read(): Session | null {
  try {
    const stored = raw();
    if (!stored) return null;
    const s = JSON.parse(stored) as Session;
    if (!s?.staffId || !s.expiresAt) return null;
    if (new Date(s.expiresAt).getTime() <= Date.now()) {
      setRaw(null);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

function write(s: Session | null) {
  setRaw(s ? JSON.stringify(s) : null);
  // Same-tab listeners: the storage event only fires in *other* tabs.
  if (typeof window !== "undefined")
    window.dispatchEvent(new CustomEvent("gateways:auth"));
}

export function mint(input: Omit<Session, "issuedAt" | "expiresAt">): Session {
  const now = Date.now();
  const s: Session = {
    ...input,
    issuedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
  };
  write(s);
  return s;
}

/** Returns the live session, extending it if it is close to expiry. */
export function current(): Session | null {
  const s = read();
  if (!s) return null;
  const left = new Date(s.expiresAt).getTime() - Date.now();
  if (left < REFRESH_WINDOW_MS) {
    const extended = { ...s, expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString() };
    write(extended);
    return extended;
  }
  return s;
}

export function clear() {
  write(null);
}

/** Patch the live session in place — used when the must-change flag clears. */
export function patch(fields: Partial<Session>): Session | null {
  const s = read();
  if (!s) return null;
  const next = { ...s, ...fields };
  write(next);
  return next;
}

/**
 * Fires on sign-in, sign-out, and on changes made in *other tabs* — so signing
 * out in one tab does not leave a second tab looking authenticated.
 */
export function subscribe(cb: (s: Session | null) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => cb(read());
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY || e.key === null) handler();
  };
  window.addEventListener("gateways:auth", handler);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener("gateways:auth", handler);
    window.removeEventListener("storage", onStorage);
  };
}
