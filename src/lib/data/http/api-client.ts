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

async function request<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
    cache: "no-store",
  });

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
