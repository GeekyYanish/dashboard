/**
 * Password hashing — PBKDF2-SHA256 via Web Crypto.
 *
 * The rest of this auth layer is explicitly demo-grade (see ./session.ts), but
 * storing passwords in plaintext is never acceptable, not even in a demo: people
 * reuse passwords, and a localStorage dump would hand them over verbatim. So
 * this part is done properly.
 *
 *   - PBKDF2-SHA256, 100,000 iterations
 *   - 16 random bytes of salt per user, so two accounts sharing a password
 *     produce different hashes and one cracked hash reveals nothing about others
 *   - Constant-time comparison, so a timing side-channel cannot leak the hash
 *
 * `crypto.subtle` exists in browsers and in Node ≥ 16, which is what lets
 * `npm test` exercise the real hashing path rather than a stub.
 *
 * (Argon2id would be the better modern choice, but it needs a WASM dependency.
 * PBKDF2 is built in, and at 100k iterations is a reasonable bar for this.)
 */

const ITERATIONS = 100_000;
const KEY_BITS = 256;
const SALT_BYTES = 16;

const toHex = (buf: ArrayBuffer): string =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

const fromHex = (hex: string): Uint8Array =>
  new Uint8Array((hex.match(/.{1,2}/g) ?? []).map((b) => parseInt(b, 16)));

function subtle(): SubtleCrypto {
  const c = globalThis.crypto;
  if (!c?.subtle) {
    throw new Error(
      "Web Crypto unavailable — password hashing requires a secure context (https or localhost).",
    );
  }
  return c.subtle;
}

export function randomSalt(): string {
  const bytes = new Uint8Array(SALT_BYTES);
  globalThis.crypto.getRandomValues(bytes);
  return toHex(bytes.buffer);
}

async function derive(password: string, saltHex: string): Promise<string> {
  const key = await subtle().importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await subtle().deriveBits(
    {
      name: "PBKDF2",
      salt: fromHex(saltHex) as unknown as BufferSource,
      iterations: ITERATIONS,
      hash: "SHA-256",
    },
    key,
    KEY_BITS,
  );
  return toHex(bits);
}

export async function hashPassword(
  password: string,
  salt = randomSalt(),
): Promise<{ hash: string; salt: string }> {
  return { hash: await derive(password, salt), salt };
}

/**
 * Constant-time compare. A plain `===` on strings short-circuits at the first
 * differing character, which leaks how much of a guess was correct.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyPassword(
  password: string,
  hash: string,
  salt: string,
): Promise<boolean> {
  return timingSafeEqual(await derive(password, salt), hash);
}

// ---------------------------------------------------------------------------
// Password policy
// ---------------------------------------------------------------------------

export interface PasswordCheck {
  ok: boolean;
  problems: string[];
  /** 0–4, for the strength meter on the set-password screen. */
  score: number;
}

const COMMON = [
  "password", "12345678", "qwerty", "letmein", "welcome",
  "admin123", "gateways", "registration", "changeme", "iloveyou",
];

export function checkPassword(pw: string, email?: string): PasswordCheck {
  const problems: string[] = [];

  if (pw.length < 10) problems.push("Use at least 10 characters");
  if (!/[a-z]/.test(pw)) problems.push("Add a lowercase letter");
  if (!/[A-Z]/.test(pw)) problems.push("Add an uppercase letter");
  if (!/[0-9]/.test(pw)) problems.push("Add a number");
  if (COMMON.some((c) => pw.toLowerCase().includes(c)))
    problems.push("Avoid common words like “password” or the fest name");
  if (email) {
    const handle = email.split("@")[0].toLowerCase();
    if (handle.length > 2 && pw.toLowerCase().includes(handle))
      problems.push("Do not put your email address in your password");
  }

  // Score is independent of the pass/fail rules — a password can clear the bar
  // and still be only "fair", which is worth showing.
  let score = 0;
  if (pw.length >= 10) score++;
  if (pw.length >= 14) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw) && /[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;

  return { ok: problems.length === 0, problems, score: Math.min(4, score) };
}

export const PASSWORD_STRENGTH_LABELS = ["Too weak", "Weak", "Fair", "Good", "Strong"];
