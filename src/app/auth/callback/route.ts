import { NextResponse } from "next/server";

export const runtime = "nodejs";

function websiteUrl() {
  return (process.env.NEXT_PUBLIC_WEBSITE_URL ?? process.env.PUBLIC_WEBSITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

function safeReturnTo(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export async function GET(request: Request) {
  const incoming = new URL(request.url);
  const code = incoming.searchParams.get("code");
  const returnTo = safeReturnTo(incoming.searchParams.get("returnTo"));
  if (!code) return NextResponse.redirect(`${websiteUrl()}/login?console=1&error=missing_handoff`);

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
    return NextResponse.redirect(`${websiteUrl()}/login?console=1&error=backend_unavailable`);
  }
  const data = await exchange.json().catch(() => null) as { token?: string; expiresAt?: string; returnTo?: string; user?: { mustChangePassword?: boolean } } | null;
  if (!exchange.ok || !data?.token) return NextResponse.redirect(`${websiteUrl()}/login?console=1&error=handoff_expired`);
  if (data.user?.mustChangePassword) return NextResponse.redirect(`${websiteUrl()}/change-password?next=${encodeURIComponent(returnTo)}`);

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
