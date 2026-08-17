"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The data-fetching contract for the whole console.
 *
 * `{ data, error, loading, reload }` deliberately mirrors TanStack Query's
 * shape, so swapping to it later is a hook rename rather than a rewrite of
 * every page — the same reason every repository method is async.
 */
export interface AsyncState<T> {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
  reload: () => void;
  /** Optimistically overwrite local data without refetching. */
  mutate: (next: T) => void;
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<Error>();
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const [externalNonce, setExternalNonce] = useState(0);

  // The latest fetcher is stashed in an effect, never written during render —
  // a ref mutation while rendering is unsafe once React can render
  // speculatively. Call sites pass an inline closure, so this ref exists purely
  // so the fetch effect re-runs on `deps` rather than on identity.
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });

  // The console shell broadcasts a refresh after its 15-second poll, when the
  // tab regains focus, and when the selected event changes. Listening here
  // keeps every mounted core view in the same live scope without duplicating
  // timers in each screen.
  useEffect(() => {
    const refresh = () => setExternalNonce((value) => value + 1);
    window.addEventListener("aurora:reload", refresh);
    window.addEventListener("registration-console:event-scope", refresh);
    return () => {
      window.removeEventListener("aurora:reload", refresh);
      window.removeEventListener("registration-console:event-scope", refresh);
    };
  }, []);

  // Background refreshes must not flip `loading`. Screens render skeletons off
  // that flag, so the shell's 15-second poll used to blank every mounted view
  // twice a minute — and anything the skeleton replaced was destroyed and
  // rebuilt, which is fatal for embedded content like the receipt viewer (the
  // PDF restarted its load every poll and never finished).
  //
  // A deps change or an explicit reload() still shows the skeleton: those mean
  // the caller asked for genuinely different data.
  const lastExternalNonce = useRef(externalNonce);

  useEffect(() => {
    let cancelled = false;
    const isBackgroundRefresh = lastExternalNonce.current !== externalNonce;
    lastExternalNonce.current = externalNonce;

    if (!isBackgroundRefresh) {
      setLoading(true);
      setError(undefined);
    }
    // Read through a local so the ref is not touched again after an await.
    const run = fnRef.current;
    run()
      .then((v) => {
        if (!cancelled) {
          setData(v);
          // A successful background refresh clears a stale error banner.
          setError(undefined);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce, externalNonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const mutate = useCallback((next: T) => setData(next), []);

  return { data, error, loading, reload, mutate };
}

/**
 * Client-only guard. The seeded store builds ~14k records in the browser; this
 * keeps that off the server render and avoids a hydration mismatch on any page
 * that shows live counts.
 */
export function useMounted(): boolean {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}

/** Debounce for search boxes — 3,000 rows should not re-filter per keystroke. */
export function useDebounced<T>(value: T, ms = 200): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
