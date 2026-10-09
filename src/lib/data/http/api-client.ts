import { DataError, type DataErrorCode } from "../types";

/**
 * The console talks only to its same-origin Next proxy. The proxy reads the
 * httpOnly console session cookie and attaches the bearer token server-side;
 * no staff token is exposed to browser JavaScript or bundled environment code.
 */

export function hasApiBackend(): boolean {
  return process.env.NEXT_PUBLIC_USE_API_BACKEND !== "false";
}

interface ApiErrorBody {
  error?: { code?: string; message?: string };
}

/* ── Freshness ───────────────────────────────────────────────────────────────
 * The backend serves console reads from an in-memory cache and stamps every
 * response with `X-Data-Version`, a number that moves forward whenever a write
 * changes what the console shows. Pages never refetch on their own. Instead the
 * shell compares the server's current version with the newest one this tab has
 * loaded, and when the server is ahead it asks the operator to press Refresh.
 */

let loadedVersion: number | null = null;
let freshUntil = 0;

function readVersion(res: Response, header: string): number | null {
  const value = Number(res.headers.get(header));
  return res.headers.has(header) && Number.isFinite(value) ? value : null;
}

function trackVersion(method: string, res: Response) {
  const version = readVersion(res, "x-data-version");
  if (version === null) return;
  if (method === "GET") {
    loadedVersion = Math.max(loadedVersion ?? 0, version);
    return;
  }
  // A write reports the version just before it too. When that matches what
  // this tab already has, the operator's own save is the only change, so the
  // tab is still current and must not be told otherwise.
  const previous = readVersion(res, "x-data-version-prev");
  if (previous !== null && loadedVersion !== null && previous <= loadedVersion) loadedVersion = version;
}

/**
 * Called by the Refresh button. For the next few seconds every read skips the
 * backend's cache and goes to the database, which covers the burst of requests
 * the refresh fans out to every mounted view.
 */
export function requestFreshData() {
  freshUntil = Date.now() + 5_000;
}

/**
 * Whether the backend has data newer than what this tab has loaded. Served from
 * the backend's memory, so checking costs no database query.
 */
export async function hasNewerData(): Promise<boolean> {
  if (loadedVersion === null) return false;
  try {
    const res = await fetch("/api/v1/admin/data-version", { credentials: "same-origin", cache: "no-store" });
    if (!res.ok) return false;
    const { version } = (await res.json()) as { version?: number };
    return typeof version === "number" && version > loadedVersion;
  } catch {
    return false;
  }
}

async function request<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (method === "GET" && Date.now() < freshUntil) headers["X-Console-Fresh"] = "1";

  const res = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
    cache: "no-store",
  });
  if (res.ok) trackVersion(method, res);

  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const payload = (json ?? {}) as ApiErrorBody;
    const code = (payload.error?.code ?? (res.status === 401 ? "NOT_AUTHENTICATED" : "STORAGE_UNAVAILABLE")) as DataErrorCode;
    throw new DataError(code, payload.error?.message ?? `Request failed (${res.status}).`);
  }
  return json as T;
}

function withQuery(path: string, query?: Record<string, string | number | boolean | undefined | null>) {
  if (!query) return path;
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  });
  const suffix = params.toString();
  return suffix ? `${path}?${suffix}` : path;
}

export const api = {
  get: <T>(path: string, query?: Record<string, string | number | boolean | undefined | null>) => request<T>("GET", withQuery(path, query)),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};
