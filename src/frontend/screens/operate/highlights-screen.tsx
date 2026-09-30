"use client";

import { useMemo, useState } from "react";
import { Building2, Copy, UsersRound, Users, Wallet } from "lucide-react";
import { Page, PageHeader, StatGrid } from "@/frontend/components/page";
import {
  NeoCard,
  NeoStatTile,
  NeoButton,
  NeoSelect,
  NeoSkeleton,
  SectionRule,
  toast,
} from "@/frontend/components/neo";
import { useAsync } from "@/frontend/hooks/use-async";
import { getRepo } from "@/lib/data";
import { FEST, inr } from "@/lib/fest.config";
import type { FestEvent } from "@/lib/data/types";

/* ==========================================================================
   Fest highlights — the numbers a college's own poster/recap needs: one
   featured event (a hackathon, a flagship competition, whatever the desk is
   promoting) plus the fest-wide totals, both pulled live rather than
   hand-typed into a design tool and going stale the next morning.
   ========================================================================== */

const FEATURED_EVENT_KEY = "registration-console.highlights.featured-event";

/** First event that reads like the headline draw; falls back to the first event at all. */
function guessFeaturedEventId(events: FestEvent[]): string | undefined {
  return events.find((e) => /hackathon|shift/i.test(e.title))?.id ?? events[0]?.id;
}

function readStoredEventId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage.getItem(FEATURED_EVENT_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function HighlightsScreen() {
  const events = useAsync(() => getRepo().events.list(), []);
  const [storedId, setStoredId] = useState<string | undefined>(readStoredEventId);
  // A stored/explicit pick wins; otherwise guess from whatever's loaded so
  // far — this is a derived render value, not state, so there's nothing to
  // synchronise once the event list actually arrives.
  const featuredId = storedId ?? guessFeaturedEventId(events.data ?? []);

  const featuredEvent = events.data?.find((e) => e.id === featuredId);

  const eventStats = useAsync(
    () => (featuredId ? getRepo().events.stats(featuredId) : Promise.resolve(null)),
    [featuredId],
  );
  const eventContingents = useAsync(
    () => (featuredId ? getRepo().colleges.contingents(featuredId) : Promise.resolve([])),
    [featuredId],
  );
  const overall = useAsync(() => getRepo().overview.stats(), []);
  const overallContingents = useAsync(() => getRepo().colleges.contingents(), []);
  const allTeams = useAsync(() => getRepo().teams.list(), []);

  const featured = useMemo(() => {
    const s = eventStats.data;
    return {
      colleges: eventContingents.data?.length ?? 0,
      // `filled` is team-aware for a team event (distinct teams, not heads) —
      // see EventStats. For a solo event it's just the headcount.
      teams: s?.filled ?? 0,
      participants: (s?.confirmedCount ?? 0) + (s?.pendingCount ?? 0),
      revenue: (eventContingents.data ?? []).reduce((sum, c) => sum + c.paid, 0),
    };
  }, [eventStats.data, eventContingents.data]);

  const fest = useMemo(
    () => ({
      colleges: overallContingents.data?.length ?? 0,
      teams: allTeams.data?.length ?? 0,
      participants: overall.data?.participants ?? 0,
      revenue: overall.data?.revenueCollected ?? 0,
    }),
    [overallContingents.data, allTeams.data, overall.data],
  );

  const loading =
    events.loading ||
    eventStats.loading ||
    eventContingents.loading ||
    overall.loading ||
    overallContingents.loading ||
    allTeams.loading;

  const copyForPoster = () => {
    const heading = featuredEvent?.title.toUpperCase() ?? "FEATURED EVENT";
    const lines = [
      FEST.host,
      featuredEvent ? `Presents ${featuredEvent.title}` : "",
      "",
      heading,
      `Colleges: ${featured.colleges}`,
      `Teams: ${featured.teams}`,
      `Participants: ${featured.participants}`,
      `Revenue Generated: ${inr(featured.revenue)}`,
      "",
      "OVERALL FEST",
      `Colleges: ${fest.colleges}`,
      `Teams: ${fest.teams}`,
      `Participants: ${fest.participants}`,
      `Revenue Generated: ${inr(fest.revenue)}`,
    ]
      .filter((line) => line !== "")
      .join("\n");
    navigator.clipboard
      ?.writeText(lines)
      .then(() => toast.success("Copied", "Paste it straight into the poster."))
      .catch(() => toast.error("Couldn't copy", "Your browser blocked clipboard access."));
  };

  return (
    <Page>
      <PageHeader
        title="Fest highlights"
        description={`Live numbers for ${FEST.fullName} posters and recap slides — pick the featured event below, and copy the block straight into whatever's building the poster.`}
        actions={
          <NeoButton size="sm" variant="secondary" icon={<Copy />} onClick={copyForPoster} disabled={loading}>
            Copy for poster
          </NeoButton>
        }
      />

      <NeoCard>
        <NeoCard.Body>
          <NeoSelect
            label="Featured event"
            hint="The event the top stat block reports on — everything else stays fest-wide."
            value={featuredId ?? ""}
            onChange={(e) => {
              const next = e.target.value || undefined;
              setStoredId(next);
              try {
                if (next) window.localStorage.setItem(FEATURED_EVENT_KEY, next);
                else window.localStorage.removeItem(FEATURED_EVENT_KEY);
              } catch {
                /* private browsing — the pick just won't survive a reload */
              }
            }}
            placeholder={events.loading ? "Loading events…" : "Choose an event"}
            options={(events.data ?? []).map((e) => ({ value: e.id, label: e.title }))}
          />
        </NeoCard.Body>
      </NeoCard>

      <div className="space-y-3">
        <SectionRule label={featuredEvent?.title.toUpperCase() ?? "FEATURED EVENT"} />
        {loading && !eventStats.data ? (
          <NeoSkeleton className="h-24" />
        ) : (
          <StatGrid cols={4}>
            <NeoStatTile label="Colleges" value={featured.colleges} icon={<Building2 />} />
            <NeoStatTile label="Teams" value={featured.teams} icon={<UsersRound />} />
            <NeoStatTile label="Participants" value={featured.participants} icon={<Users />} />
            <NeoStatTile
              label="Revenue generated"
              value={inr(featured.revenue, { compact: true })}
              icon={<Wallet />}
            />
          </StatGrid>
        )}
      </div>

      <div className="space-y-3">
        <SectionRule label="OVERALL FEST" />
        <StatGrid cols={4}>
          <NeoStatTile label="Colleges" value={fest.colleges} icon={<Building2 />} />
          <NeoStatTile label="Teams" value={fest.teams} icon={<UsersRound />} />
          <NeoStatTile label="Participants" value={fest.participants.toLocaleString("en-IN")} icon={<Users />} />
          <NeoStatTile label="Revenue generated" value={inr(fest.revenue, { compact: true })} icon={<Wallet />} />
        </StatGrid>
      </div>
    </Page>
  );
}
