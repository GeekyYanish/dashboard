import type { Repository } from "../repository";
import { MockRepository } from "../local/mock-repository";
import { HttpAdmin, HttpAuth, HttpEvents, HttpOverview, HttpParticipants, HttpPayments, HttpRegistrations, HttpStaff, HttpTeams } from "./http-real-repository";

/**
 * Live console composition. Core registration data always comes from the
 * backend. Legacy operations without a reviewed backend endpoint remain on the
 * mock repository and are intentionally isolated from core overview totals.
 */
export function createHttpRepository(): Repository {
  const demo = new MockRepository();
  return {
    ...demo,
    auth: new HttpAuth(),
    overview: new HttpOverview(),
    participants: new HttpParticipants(),
    registrations: new HttpRegistrations(),
    payments: new HttpPayments(),
    events: new HttpEvents(),
    teams: new HttpTeams(),
    staff: new HttpStaff(),
    admin: new HttpAdmin(),
  };
}
