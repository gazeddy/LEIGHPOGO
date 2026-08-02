import {
  getEventDestination,
  type PokemonGoEventSummary,
  type RaidBossTickerItem,
} from "./events";

const EVENTS_PAGE_EXCLUDED_TYPES = new Set([
  "go-battle-league",
  "go-pass",
  "raid-battles",
  "research-breakthrough",
  "season",
]);

const TICKER_EXCLUDED_TYPES = new Set([
  ...EVENTS_PAGE_EXCLUDED_TYPES,
  "pokemon-spotlight-hour",
]);

function parseEventDate(value: string): Date {
  const includesTimeZone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);

  return new Date(includesTimeZone ? value : `${value}Z`);
}

function eventOverlapsWeekend(event: PokemonGoEventSummary): boolean {
  const start = parseEventDate(event.start);
  const end = parseEventDate(event.end);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return false;
  }

  const cursor = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()),
  );
  const lastDate = Date.UTC(
    end.getUTCFullYear(),
    end.getUTCMonth(),
    end.getUTCDate(),
  );

  while (cursor.getTime() <= lastDate) {
    const day = cursor.getUTCDay();

    if (day === 0 || day === 6) {
      return true;
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return false;
}

export function shouldShowOnEventsPage(
  event: PokemonGoEventSummary,
): boolean {
  if (event.source === "local") {
    return true;
  }

  return !EVENTS_PAGE_EXCLUDED_TYPES.has(event.eventType.toLowerCase());
}

export function shouldShowInEventTicker(
  event: PokemonGoEventSummary,
): boolean {
  const eventType = event.eventType.toLowerCase();

  if (eventType === "raid-hour" || eventType === "max-mondays") {
    return true;
  }

  if (TICKER_EXCLUDED_TYPES.has(eventType)) {
    return false;
  }

  return eventOverlapsWeekend(event);
}

function isActiveAt(event: PokemonGoEventSummary, now: Date): boolean {
  const start = parseEventDate(event.start);
  const end = parseEventDate(event.end);

  return (
    !Number.isNaN(start.getTime()) &&
    !Number.isNaN(end.getTime()) &&
    start.getTime() <= now.getTime() &&
    end.getTime() >= now.getTime()
  );
}

function raidBossItem(
  event: PokemonGoEventSummary,
): RaidBossTickerItem | null {
  const name = event.name.trim();
  const link = getEventDestination(event);
  const fiveStar = name.match(/^(.*?) in (?:5-star|five-star) Raid Battles$/i);

  if (fiveStar) {
    return {
      eventID: event.eventID,
      category: "five-star",
      label: "5★",
      boss: fiveStar[1].trim(),
      end: event.end,
      link,
    };
  }

  const shadow = name.match(/^Shadow (.*?) in Shadow Raids$/i);

  if (shadow) {
    return {
      eventID: event.eventID,
      category: "shadow",
      label: "Shadow",
      boss: shadow[1].trim(),
      end: event.end,
      link,
    };
  }

  const mega = name.match(/^Mega (.*?) in Mega Raids$/i);

  if (mega) {
    return {
      eventID: event.eventID,
      category: "mega",
      label: "Mega",
      boss: mega[1].trim(),
      end: event.end,
      link,
    };
  }

  return null;
}

export function selectCurrentRaidBosses(
  events: PokemonGoEventSummary[],
  now: Date = new Date(),
): RaidBossTickerItem[] {
  const categoryOrder: Record<RaidBossTickerItem["category"], number> = {
    "five-star": 0,
    shadow: 1,
    mega: 2,
  };

  return events
    .filter(
      (event) =>
        event.eventType.toLowerCase() === "raid-battles" &&
        isActiveAt(event, now),
    )
    .map(raidBossItem)
    .filter((item): item is RaidBossTickerItem => item !== null)
    .sort((left, right) => {
      const categoryDifference =
        categoryOrder[left.category] - categoryOrder[right.category];

      return categoryDifference !== 0
        ? categoryDifference
        : left.boss.localeCompare(right.boss);
    });
}
