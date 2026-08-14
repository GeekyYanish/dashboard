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

async function revoke(token: string) {
  await fetch(backendUrl("/api/v1/auth/signout"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  }).catch(() => undefined);
}

/**
 * Direct console sign-in without exposing a bearer credential to browser JS.
 *
 * Password verification and staff authorization still happen in the backend.
 * For regular staff we also retain the short-lived, single-use handoff check;
 * only the exchanged console token is stored in this origin's httpOnly cookie.
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
    signin = await fetch(backendUrl("/api/v1/auth/signin"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
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

  const signinData = (await json(signin)) as (SigninResponse & BackendError) | null;
  if (!signin.ok || !signinData?.token) return backendFailure(signin, signinData);

  const initialToken = signinData.token;

  // This endpoint re-checks active ADMIN / ORGANIZER / SCANNER assignments in
  // the database. A valid participant password alone never opens the console.
  const staffSession = await fetch(backendUrl("/api/v1/admin/auth/session"), {
    headers: { Authorization: `Bearer ${initialToken}` },
    cache: "no-store",
  }).catch(() => null);

  if (!staffSession) {
    await revoke(initialToken);
    return NextResponse.json(
      { error: { code: "BACKEND_UNAVAILABLE", message: "The registration service is unavailable. Try again shortly." } },
      { status: 503 },
    );
  }

  const staffData = (await json(staffSession)) as
    | (BackendError & { user?: { mustChangePassword?: boolean } })
    | null;
  if (!staffSession.ok) {
    await revoke(initialToken);
    return backendFailure(staffSession, staffData);
  }

  // A temporary password must be replaced before ordinary console access. The
  // short-lived token is kept only in the same protected cookie so the existing
  // password-change screen can rotate it without sending it to client JS.
  if (staffData?.user?.mustChangePassword) {
    return withSessionCookie(
      NextResponse.json({ next: "/login/set-password", mustChangePassword: true }),
      initialToken,
      signinData.expiresAt,
    );
  }

  const handoff = await fetch(backendUrl("/api/v1/auth/console-handoff"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${initialToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ returnTo }),
    cache: "no-store",
  }).catch(() => null);

  if (!handoff) {
    await revoke(initialToken);
    return NextResponse.json(
      { error: { code: "BACKEND_UNAVAILABLE", message: "The registration service is unavailable. Try again shortly." } },
      { status: 503 },
    );
  }

  const handoffData = (await json(handoff)) as (BackendError & { url?: string }) | null;
  if (!handoff.ok || !handoffData?.url) {
    await revoke(initialToken);
    return backendFailure(handoff, handoffData);
  }

  let code: string | null = null;
  try {
    code = new URL(handoffData.url).searchParams.get("code");
  } catch {
    // The backend owns this URL. Treat a malformed response as unavailable,
    // never as permission to bypass the handoff.
  }
  if (!code) {
    await revoke(initialToken);
    return NextResponse.json(
      { error: { code: "HANDOFF_FAILED", message: "The secure console handoff could not be created." } },
      { status: 502 },
    );
  }

  const exchange = await fetch(backendUrl("/api/v1/auth/console-handoff/exchange"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
    cache: "no-store",
  }).catch(() => null);

  if (!exchange) {
    await revoke(initialToken);
    return NextResponse.json(
      { error: { code: "BACKEND_UNAVAILABLE", message: "The registration service is unavailable. Try again shortly." } },
      { status: 503 },
    );
  }

  const exchangeData = (await json(exchange)) as
    | (BackendError & { token?: string; expiresAt?: string; returnTo?: string })
    | null;
  if (!exchange.ok || !exchangeData?.token) {
    await revoke(initialToken);
    return backendFailure(exchange, exchangeData);
  }

  // The credential used to request the handoff is no longer needed. Keeping
  // only the exchanged console session minimizes active credentials per login.
  await revoke(initialToken);

  return withSessionCookie(
    NextResponse.json({ next: exchangeData.returnTo ?? returnTo }),
    exchangeData.token,
    exchangeData.expiresAt,
  );
}
