import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE = "registration_console_session";
const HOP_BY_HOP = new Set(["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade", "host", "content-length"]);

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
  if (response.status === 401 || response.status === 403) {
    responseHeaders.append("set-cookie", `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
  }
  return new NextResponse(response.status === 204 ? null : response.body, { status: response.status, headers: responseHeaders });
}

export const GET = forward;
export const POST = forward;
export const PATCH = forward;
export const DELETE = forward;
