import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const Body = z.object({
  email: z.string().email("Enter a valid email address.").max(255),
  otp: z.string().regex(/^\d{4,8}$/, "Enter the code from your email."),
  newPassword: z.string().min(10, "Use at least 10 characters.").max(72),
});

type WebsiteResponse = { status?: string; message?: string };

function backendUrl(path: string) {
  const base = process.env.REGISTRATION_API_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:4000";
  return `${base}${path}`;
}

/**
 * Translates the website auth router's { status, message } into the console's
 * { error: { code, message } }, because the screens switch on `code` and never
 * on message text.
 *
 * The mapping is by phrase, which is fragile, and deliberately falls back to
 * VALIDATION_FAILED with the backend's own wording rather than inventing one:
 * a message that changes upstream then reads slightly off instead of turning
 * into a lie about what went wrong.
 */
function codeFor(status: number, message: string): string {
  const text = message.toLowerCase();
  if (text.includes("otp")) return "INVALID_CREDENTIALS";
  if (text.includes("password must be")) return "PASSWORD_TOO_WEAK";
  if (status === 404) return "NOT_FOUND";
  return "VALIDATION_FAILED";
}

/**
 * Step two: spend the one-time code and set the new password.
 *
 * No session cookie is set here even on success. The recovered account has just
 * had every console session revoked backend-side, and signing someone in on the
 * strength of an emailed code would undo that; they sign in again afterwards.
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
          message: parsed.error.issues[0]?.message ?? "Check the details and try again.",
        },
      },
      { status: 400 },
    );
  }

  let response: Response;
  try {
    response = await fetch(backendUrl("/api/v1/auth/reset-password"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: parsed.data.email,
        otp: parsed.data.otp,
        newPassword: parsed.data.newPassword,
      }),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { error: { code: "BACKEND_UNAVAILABLE", message: "The registration service is unavailable. Try again shortly." } },
      { status: 503 },
    );
  }

  const data = (await response.json().catch(() => null)) as WebsiteResponse | null;

  if (response.ok) return NextResponse.json({ reset: true });

  const message = data?.message ?? "Could not reset the password. Request a new code and try again.";
  return NextResponse.json(
    { error: { code: codeFor(response.status, message), message } },
    { status: response.status >= 400 && response.status < 500 ? response.status : 502 },
  );
}
