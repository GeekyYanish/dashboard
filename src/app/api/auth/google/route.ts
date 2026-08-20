import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/auth/google
 *
 * Initiates Google OAuth for the registration console.
 *
 * The browser must visit the backend's /signin/google endpoint directly so
 * that the backend can set its own httpOnly state cookies (oauth_state,
 * oauth_return_to, oauth_client) in the browser's cookie jar. Those cookies
 * travel with the browser through Google's redirect back to the backend
 * callback, where they are consumed.
 *
 * We cannot do a server-to-server fetch here because Set-Cookie headers from
 * a server-side fetch don't reach the browser. Instead we redirect the browser
 * to the public-facing backend URL so it lands the cookies itself.
 *
 * NEXT_PUBLIC_API_URL   — the public URL of the backend (e.g. http://localhost:4000)
 * REGISTRATION_API_URL  — internal server-only URL (may be 127.0.0.1:4000)
 *
 * If NEXT_PUBLIC_API_URL is unset, falls back to REGISTRATION_API_URL (fine
 * in local development where both resolve to the same host).
 */
export async function GET(request: Request) {
  const incoming = new URL(request.url);
  const returnTo = incoming.searchParams.get("returnTo") ?? "/";

  // Prefer the public-facing backend URL; fall back to internal for local dev.
  const base = (
    process.env.NEXT_PUBLIC_API_URL ??
    process.env.REGISTRATION_API_URL ??
    "http://localhost:4000"
  ).replace(/\/$/, "");

  const googleInitUrl =
    `${base}/api/v1/auth/signin/google` +
    `?client=console&returnTo=${encodeURIComponent(returnTo)}`;

  return NextResponse.redirect(googleInitUrl);
}
