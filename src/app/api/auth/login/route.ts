import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const COOKIE = "registration_console_session";
const LoginBody = z.object({
  email: z.string().email("Enter a valid email address.").max(255),
  password: z.string().min(1, "Password is required.").max(72),
  returnTo: z.string().regex(/^\/(?!\/)/).max(200).optional(),
});

type BackendError = {
  error?: { code?: string; message?: string };
};

type SigninResponse = {
  token?: string;
  expiresAt?: string;
  user?: { id: string; email: string; mustChangePassword?: boolean };
};

function backendUrl(path: string) {
  const base = process.env.REGISTRATION_API_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:4000";
  return `${base}${path}`;
}

function maxAge(expiresAt?: string) {
  return expiresAt
    ? Math.max(1, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))
    : 12 * 60 * 60;
}

function withSessionCookie(response: NextResponse, token: string, expiresAt?: string) {
  response.cookies.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV !== "development",
    sameSite: "lax",
    path: "/",
    maxAge: maxAge(expiresAt),
  });
  return response;
}

async function json(response: Response) {
  return response.json().catch(() => null) as Promise<BackendError | null>;
}

function backendFailure(response: Response, data: BackendError | null) {
  return NextResponse.json(
    {
      error: {
        code: data?.error?.code ?? "SIGN_IN_FAILED",
        message: data?.error?.message ?? "Could not sign in to the registration console.",
      },
    },
    { status: response.status >= 400 && response.status < 500 ? response.status : 502 },
  );
}

/**
 * Console sign-in: one backend call.
 *
 * Hits the admin door, which verifies the password and requires an active
 * ADMIN / ORGANIZER / SCANNER assignment *before* issuing anything. A
 * participant password alone never opens the console, and a rejected login
 * leaves no session row behind — so there is nothing to revoke afterwards.
 *
 * This used to take five round-trips (participant signin, staff probe, handoff,
 * exchange, revoke) because the participant door issued a live credential first
 * and authorization was checked second. Moving the check ahead of issuance made
 * all of that unnecessary.
 *
 * The bearer token never reaches browser JS: it goes straight into this
 * origin's httpOnly cookie, and the /api/v1 proxy injects it server-side.
 */
export async function POST(request: Request) {
  const requestOrigin = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  if (origin && origin !== requestOrigin) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "This sign-in request came from an untrusted origin." } },
      { status: 403 },
    );
  }

  const parsed = LoginBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_FAILED", message: parsed.error.issues[0]?.message ?? "Check the sign-in details." } },
      { status: 400 },
    );
  }

  const returnTo = parsed.data.returnTo ?? "/";

  let signin: Response;
  try {
    signin = await fetch(backendUrl("/api/v1/admin/auth/signin"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Bearer, not cookie: the backend is a different origin, so its cookie
        // would be third-party here. The token lands in our own cookie instead.
        "X-Auth-Transport": "bearer",
      },
      body: JSON.stringify({ email: parsed.data.email, password: parsed.data.password }),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { error: { code: "BACKEND_UNAVAILABLE", message: "The registration service is unavailable. Try again shortly." } },
      { status: 503 },
    );
  }

  const data = (await json(signin)) as (SigninResponse & BackendError) | null;

  // 401 wrong password, 403 no console role. Both are relayed as-is: the
  // backend already phrases them without revealing which accounts exist.
  if (!signin.ok || !data?.token) return backendFailure(signin, data);

  // A temporary password must be replaced before ordinary console access. The
  // token still goes into the protected cookie so the existing password-change
  // screen can rotate it without ever exposing it to client JS.
  if (data.user?.mustChangePassword) {
    return withSessionCookie(
      NextResponse.json({ next: "/login/set-password", mustChangePassword: true }),
      data.token,
      data.expiresAt,
    );
  }

  return withSessionCookie(NextResponse.json({ next: returnTo }), data.token, data.expiresAt);
}
