import type { PokemonGoEventSummary } from "./events";
import {
  forceRefreshEventsCache,
  getEventsPageData,
} from "./events-server";

export interface PokemonGoSeasonBoundary {
  eventID: string;
  name: string;
  start: string;
  end: string;
}

const EXPLICIT_TIME_ZONE = /(?:Z|[+-]\d{2}:\d{2})$/i;

function londonWallClock(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}`;
}

function timestampPosition(value: string, now: Date): number {
  if (EXPLICIT_TIME_ZONE.test(value)) {
    const timestamp = Date.parse(value);

    return Number.isFinite(timestamp) ? timestamp - now.getTime() : Number.NaN;
  }

  return value.slice(0, 19).localeCompare(londonWallClock(now));
}

function isActiveSeason(
  event: PokemonGoEventSummary,
  now: Date,
): boolean {
  if (event.eventType !== "season") {
    return false;
  }

  const startPosition = timestampPosition(event.start, now);
  const endPosition = timestampPosition(event.end, now);

  return (
    Number.isFinite(startPosition) &&
    Number.isFinite(endPosition) &&
    startPosition <= 0 &&
    endPosition > 0
  );
}

export function selectCurrentPokemonGoSeason(
  events: PokemonGoEventSummary[],
  now: Date = new Date(),
): PokemonGoSeasonBoundary | null {
  const season = events
    .filter((event) => isActiveSeason(event, now))
    .sort((left, right) => right.start.localeCompare(left.start))[0];

  if (!season) {
    return null;
  }

  return {
    eventID: season.eventID,
    name: season.name,
    start: season.start,
    end: season.end,
  };
}

export async function getCurrentPokemonGoSeason(
  now: Date = new Date(),
): Promise<PokemonGoSeasonBoundary | null> {
  const cachedEvents = await getEventsPageData(300);
  const cachedSeason = selectCurrentPokemonGoSeason(cachedEvents.events, now);

  if (cachedSeason) {
    return cachedSeason;
  }

  // A missing active season normally means the previous season's exact end
  // timestamp has passed. Refresh ScrapedDuck immediately instead of waiting
  // for the normal weekly events-cache refresh.
  const refreshedEvents = await forceRefreshEventsCache(300);

  return selectCurrentPokemonGoSeason(refreshedEvents.events, now);
}
