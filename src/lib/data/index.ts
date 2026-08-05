/**
 * THE SINGLE CONSTRUCTION POINT.
 *
 * Swapping the mock for a real backend is this one line plus a second
 * implementation of `Repository`. Nothing else in the app changes, because
 * nothing else knows where the data comes from.
 *
 *   import { HttpRepository } from "./http/http-repository";
 *   export const repo: Repository = new HttpRepository(process.env.API_URL!);
 */

import type { Repository } from "./repository";
import { MockRepository } from "./local/mock-repository";

let cached: Repository | null = null;

/**
 * Lazily constructed so the seed generator never runs during SSR — it builds
 * ~14k records and the server has no use for them.
 */
export function getRepo(): Repository {
  if (!cached) cached = new MockRepository();
  return cached;
}

export type { Repository } from "./repository";
export * from "./types";
