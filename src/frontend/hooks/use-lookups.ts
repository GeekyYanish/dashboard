"use client";

import { useMemo } from "react";
import { useAsync } from "./use-async";
import { getRepo } from "@/lib/data";
import type { College, FestEvent, Participant, StaffMember } from "@/lib/data/types";

/**
 * Reference data every list needs to render a row: participant, event, college
 * and staff names. Fetched once and indexed, because resolving them per-row
 * with `.find()` is what turns a 3,000-row table into a slideshow.
 */
export function useLookups() {
  const participants = useAsync(() => getRepo().participants.list(), []);
  const events = useAsync(() => getRepo().events.list(), []);
  const colleges = useAsync(() => getRepo().colleges.list(), []);
  const staff = useAsync(() => getRepo().staff.list(), []);

  return useMemo(() => {
    const pMap = new Map<string, Participant>((participants.data ?? []).map((p) => [p.id, p]));
    const eMap = new Map<string, FestEvent>((events.data ?? []).map((e) => [e.id, e]));
    const cMap = new Map<string, College>((colleges.data ?? []).map((c) => [c.id, c]));
    const sMap = new Map<string, StaffMember>((staff.data ?? []).map((s) => [s.id, s]));
    return {
      loading:
        participants.loading || events.loading || colleges.loading || staff.loading,
      participants: participants.data ?? [],
      events: events.data ?? [],
      colleges: colleges.data ?? [],
      staff: staff.data ?? [],
      participant: (id: string) => pMap.get(id),
      event: (id: string) => eMap.get(id),
      college: (id: string) => cMap.get(id),
      staffMember: (id: string | null) => (id ? sMap.get(id) : undefined),
      /** Participant → their college, in one hop. */
      collegeOf: (participantId: string) => {
        const p = pMap.get(participantId);
        return p ? cMap.get(p.collegeId) : undefined;
      },
      reload: () => {
        participants.reload();
        events.reload();
        colleges.reload();
        staff.reload();
      },
    };
  }, [participants, events, colleges, staff]);
}

export type Lookups = ReturnType<typeof useLookups>;
