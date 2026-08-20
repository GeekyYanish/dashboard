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
import { createHttpRepository } from "./http/http-repository";

let cached: Repository | null = null;

/**
 * Returns the live HTTP repository.
 */
export function getRepo(): Repository {
  if (!cached) cached = createHttpRepository();
  return cached;
}

export type { Repository } from "./repository";
export * from "./types";
