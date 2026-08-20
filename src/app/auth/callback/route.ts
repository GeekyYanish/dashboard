import { NextResponse } from "next/server";

export const runtime = "nodejs";

function safeReturnTo(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

function loginUrl(origin: string, error: string, returnTo = "/") {
  const url = new URL("/login", origin);
  url.searchParams.set("error", error);
  url.searchParams.set("next", returnTo);
  return url;
}

export async function GET(request: Request) {
  const incoming = new URL(request.url);
  const code = incoming.searchParams.get("code");
  const returnTo = safeReturnTo(incoming.searchParams.get("returnTo"));
  if (!code) return NextResponse.redirect(loginUrl(incoming.origin, "missing_handoff", returnTo));

  const base = process.env.REGISTRATION_API_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:4000";
  let exchange: Response;
  try {
    exchange = await fetch(`${base}/api/v1/auth/console-handoff/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
      cache: "no-store",
    });
  } catch {
    return NextResponse.redirect(loginUrl(incoming.origin, "backend_unavailable", returnTo));
  }
  const data = await exchange.json().catch(() => null) as {
    token?: string;
    expiresAt?: string;
    returnTo?: string;
    user?: { mustChangePassword?: boolean };
    error?: { code?: string };
  } | null;

  if (!exchange.ok || !data?.token) {
    // Surface meaningful errors so the login page can show the right message.
    // FORBIDDEN → the user authenticated with Google but has no console role.
    // MUST_CHANGE_PASSWORD → temporary password must be rotated first.
    // Everything else → treat as an expired/invalid handoff code.
    const code = data?.error?.code;
    if (code === "FORBIDDEN") return NextResponse.redirect(loginUrl(incoming.origin, "no_console_access", returnTo));
    if (code === "MUST_CHANGE_PASSWORD") return NextResponse.redirect(loginUrl(incoming.origin, "password_change_required", returnTo));
    return NextResponse.redirect(loginUrl(incoming.origin, "handoff_expired", returnTo));
  }

  if (data.user?.mustChangePassword) return NextResponse.redirect(loginUrl(incoming.origin, "password_change_required", returnTo));

  const response = NextResponse.redirect(new URL(returnTo, incoming.origin));
  const maxAge = data.expiresAt ? Math.max(1, Math.floor((new Date(data.expiresAt).getTime() - Date.now()) / 1000)) : 12 * 60 * 60;
  response.cookies.set("registration_console_session", data.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV !== "development",
    sameSite: "lax",
    path: "/",
    maxAge,
  });
  return response;
}
