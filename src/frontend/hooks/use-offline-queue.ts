"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Offline-tolerant write queue for the desk.
 *
 * Venue Wi-Fi fails. The registration desk cannot. Writes are appended here
 * first, flushed when connectivity returns, and the pending count is always on
 * screen so the volunteer knows whether their last five walk-ins actually
 * landed.
 *
 * The queue survives a page reload (it is persisted), because the other way
 * this goes wrong is a browser crash halfway through a rush.
 */

const KEY = "aurora.desk.queue.v1";

export interface QueuedOp {
  id: string;
  kind: string;
  label: string;
  payload: unknown;
  queuedAt: string;
  attempts: number;
}

export function useOfflineQueue(flush: (op: QueuedOp) => Promise<void>) {
  const [queue, setQueue] = useState<QueuedOp[]>([]);
  const [online, setOnline] = useState(true);
  const [flushing, setFlushing] = useState(false);

  useEffect(() => {
    setOnline(navigator.onLine);
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setQueue(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  const persist = useCallback((next: QueuedOp[]) => {
    setQueue(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  const enqueue = useCallback(
    (kind: string, label: string, payload: unknown) => {
      const op: QueuedOp = {
        id: `${Date.now()}-${Math.round(Math.random() * 1e6)}`,
        kind,
        label,
        payload,
        queuedAt: new Date().toISOString(),
        attempts: 0,
      };
      persist([...queue, op]);
      return op;
    },
    [queue, persist],
  );

  const flushAll = useCallback(async () => {
    if (flushing || !queue.length) return;
    setFlushing(true);
    const remaining: QueuedOp[] = [];
    for (const op of queue) {
      try {
        await flush(op);
      } catch {
        remaining.push({ ...op, attempts: op.attempts + 1 });
      }
    }
    persist(remaining);
    setFlushing(false);
  }, [queue, flush, flushing, persist]);

  // Auto-flush the moment connectivity returns.
  useEffect(() => {
    if (online && queue.length && !flushing) void flushAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  return { queue, online, flushing, enqueue, flushAll, pending: queue.length };
}
