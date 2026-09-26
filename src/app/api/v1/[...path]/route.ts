import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE = "registration_console_session";
/**
 * Dropped in both directions. `content-encoding` is the subtle one: fetch has
 * already decompressed the upstream body by the time we see it, so relaying
 * the header would label plain JSON as gzip and the browser would discard it.
 * The backend only compresses past a size threshold, so this stays invisible
 * until a list grows — every short response works, and the first long one
 * arrives empty.
 */
const HOP_BY_HOP = new Set(["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade", "host", "content-length", "content-encoding"]);

/**
 * Whether a 403 means the session itself is finished.
 *
 * Most 403s are a refusal of one action, not of the person: an event head
 * opening an ADMIN-only list (payments, staff, audit), asking for an event they
 * are not assigned to, or an administrator trying to reset their own password.
 * Clearing the cookie on those signed the operator out of a session that was
 * still valid — the dashboard alone touches several ADMIN-only endpoints, so an
 * event head was ejected the moment they opened it.
 *
 * The session is dead only when the account is disabled, or when the session
 * probe itself is refused (the account no longer holds any console assignment).
 */
async function sessionIsDead(response: Response, suffix: string): Promise<boolean> {
  if (suffix === "/admin/auth/session") return true;
  const body = (await response.clone().json().catch(() => null)) as { error?: { code?: string } } | null;
  return body?.error?.code === "ACCOUNT_DISABLED";
}

async function forward(request: Request) {
  const token = (await cookies()).get(COOKIE)?.value;
  const base = process.env.REGISTRATION_API_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:4000";
  const incoming = new URL(request.url);
  const suffix = incoming.pathname.replace(/^\/api\/v1/, "");
  const target = `${base}/api/v1${suffix}${incoming.search}`;
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase()) && key.toLowerCase() !== "authorization") headers.set(key, value);
  });
  if (token) headers.set("authorization", `Bearer ${token}`);
  const init: RequestInit = { method: request.method, headers, redirect: "manual", cache: "no-store" };
  if (request.method !== "GET" && request.method !== "HEAD") {
    const body = await request.arrayBuffer();
    if (body.byteLength) init.body = body;
  }
  let response: Response;
  try {
    response = await fetch(target, init);
  } catch {
    return NextResponse.json({ error: { code: "STORAGE_UNAVAILABLE", message: "Registration service unavailable." } }, { status: 503 });
  }
  const responseHeaders = new Headers();
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() !== "set-cookie" && !HOP_BY_HOP.has(key.toLowerCase())) responseHeaders.set(key, value);
  });
  if (response.status === 401 || (response.status === 403 && (await sessionIsDead(response, suffix)))) {
    responseHeaders.append("set-cookie", `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
  }

  // Changing a temporary password revokes the old bearer session and returns a
  // rotated one. Keep that token server-side: replace the console cookie and
  // remove the credential from the JSON body before it reaches browser code.
  if (suffix === "/auth/change-password" && response.ok) {
    const data = await response.json().catch(() => null) as
      | ({ token?: string; expiresAt?: string } & Record<string, unknown>)
      | null;
    if (data?.token) {
      const { token, expiresAt, ...safeData } = data;
      const next = NextResponse.json(safeData, { status: response.status, headers: responseHeaders });
      const cookieMaxAge = expiresAt
        ? Math.max(1, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))
        : 12 * 60 * 60;
      next.cookies.set(COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV !== "development",
        sameSite: "lax",
        path: "/",
        maxAge: cookieMaxAge,
      });
      return next;
    }
  }
  return new NextResponse(response.status === 204 ? null : response.body, { status: response.status, headers: responseHeaders });
}

export const GET = forward;
export const POST = forward;
export const PATCH = forward;
export const DELETE = forward;
