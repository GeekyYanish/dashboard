import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get("registration_console_session")?.value;
  const base = process.env.REGISTRATION_API_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:4000";
  if (token) {
    await fetch(`${base}/api/v1/admin/auth/signout`, { method: "POST", headers: { Authorization: `Bearer ${token}` } }).catch(() => undefined);
  }
  const response = NextResponse.json({ message: "Signed out." });
  response.cookies.set("registration_console_session", "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV !== "development", path: "/", maxAge: 0 });
  return response;
}
