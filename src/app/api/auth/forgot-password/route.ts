import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const Body = z.object({ email: z.string().email("Enter a valid email address.").max(255) });

type WebsiteResponse = {
  status?: string;
  message?: string;
  cooldownRemaining?: number;
};

function backendUrl(path: string) {
  const base = process.env.REGISTRATION_API_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:4000";
  return `${base}${path}`;
}

/**
 * Step one of console password recovery: ask for the one-time code.
 *
 * This does not go through /api/v1/[...path]. That proxy exists to attach the
 * console session cookie as a bearer token, and the whole point of this route is
 * that the caller has no session. It also speaks the wrong dialect: the website
 * auth router answers { status, message }, while everything on the console side
 * reads { error: { code, message } }, so an unmapped failure would reach the
 * screen as "Request failed (400)" with the real reason discarded.
 *
 * The backend's own reply is uniform whether or not the address exists, and it
 * is relayed unchanged. Adding a "no such account" branch here would rebuild the
 * enumeration oracle the backend is careful not to be.
 */
export async function POST(request: Request) {
  const requestOrigin = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  if (origin && origin !== requestOrigin) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "This request came from an untrusted origin." } },
      { status: 403 },
    );
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_FAILED",
          message: parsed.error.issues[0]?.message ?? "Enter a valid email address.",
        },
      },
      { status: 400 },
    );
  }

  let response: Response;
  try {
    response = await fetch(backendUrl("/api/v1/auth/forgot-password"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: parsed.data.email }),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { error: { code: "BACKEND_UNAVAILABLE", message: "The registration service is unavailable. Try again shortly." } },
      { status: 503 },
    );
  }

  const data = (await response.json().catch(() => null)) as WebsiteResponse | null;

  if (response.ok) return NextResponse.json({ sent: true });

  // 429 is the 30-second resend cooldown. It carries the seconds left, which is
  // the only part of this the screen can act on.
  if (response.status === 429) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_FAILED",
          message: data?.message ?? "Wait a moment before requesting another code.",
        },
        cooldownRemaining: data?.cooldownRemaining ?? 30,
      },
      { status: 429 },
    );
  }

  return NextResponse.json(
    {
      error: {
        code: "VALIDATION_FAILED",
        message: data?.message ?? "Could not send a reset code. Try again shortly.",
      },
    },
    { status: response.status >= 400 && response.status < 500 ? response.status : 502 },
  );
}
