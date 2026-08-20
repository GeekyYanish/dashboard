import type { Repository } from "../repository";
import { DataError } from "../types";
import { HttpAdmin, HttpAudit, HttpAuth, HttpEvents, HttpOverview, HttpParticipants, HttpPayments, HttpRegistrations, HttpStaff, HttpTeams, HttpColleges } from "./http-real-repository";

/**
 * Live console composition. Core registration data always comes from the
 * backend. Legacy operations without a reviewed backend endpoint throw errors.
 */
export function createHttpRepository(): Repository {
  const unimplemented = new Proxy({}, {
    get: () => new Proxy({}, {
      get: () => () => { throw new DataError("FORBIDDEN", "This legacy feature has been disabled and removed."); }
    })
  }) as any;

  return {
    ...unimplemented,
    auth: new HttpAuth(),
    overview: new HttpOverview(),
    participants: new HttpParticipants(),
    registrations: new HttpRegistrations(),
    payments: new HttpPayments(),
    events: new HttpEvents(),
    teams: new HttpTeams(),
    staff: new HttpStaff(),
    colleges: new HttpColleges(),
    admin: new HttpAdmin(),
    audit: new HttpAudit(),
  } as Repository;
}
