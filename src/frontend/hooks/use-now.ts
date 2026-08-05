"use client";

import { useEffect, useState } from "react";

/**
 * A clock that is stable across the server render and the first client render.
 *
 * Calling `Date.now()` during render makes the component impure: the server and
 * the client compute different values, which is a hydration mismatch waiting to
 * happen (and React's purity lint correctly flags it). This returns `null` until
 * mounted, so anything time-derived simply renders nothing on the first pass.
 *
 * `tickMs` re-renders on an interval — used by countdowns and the war room.
 */
export function useNow(tickMs?: number): number | null {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    if (!tickMs) return;
    const id = setInterval(() => setNow(Date.now()), tickMs);
    return () => clearInterval(id);
  }, [tickMs]);

  return now;
}

/** Whole days from now until an ISO timestamp; null before mount. */
export function useDaysUntil(iso: string): number | null {
  const now = useNow(60_000);
  if (now == null) return null;
  return Math.ceil((new Date(iso).getTime() - now) / 86_400_000);
}
