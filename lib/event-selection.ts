import {
  getEventDestination,
  type PokemonGoEventSummary,
  type RaidBossTickerItem,
  type RaidCategory,
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

export const RAID_NEXT_NOTICE_WINDOW_MS = 24 * 60 * 60 * 1000;

function hasExplicitTimeZone(value: string): boolean {
  return /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
}

function parseEventDate(value: string): Date {
  return new Date(hasExplicitTimeZone(value) ? value : `${value}Z`);
}

function londonWallClockMs(now: Date): number {
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
      .map((part) => [part.type, Number(part.value)]),
  );

  return Date.UTC(
    values.year,
    values.month - 1,
    values.day,
    values.hour,
    values.minute,
    values.second,
    now.getUTCMilliseconds(),
  );
}

function comparisonNowMs(now: Date, eventValue: string): number {
  return hasExplicitTimeZone(eventValue) ? now.getTime() : londonWallClockMs(now);
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

  const nowMs = comparisonNowMs(now, event.start);

  return (
    !Number.isNaN(start.getTime()) &&
    !Number.isNaN(end.getTime()) &&
    start.getTime() <= nowMs &&
    end.getTime() > nowMs
  );
}

export function raidCategoryLabel(category: RaidCategory): string {
  if (category === "five-star") return "5★";
  if (category === "shadow") return "Shadow 5★";
  return "Mega";
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
      label: raidCategoryLabel("five-star"),
      boss: fiveStar[1].trim(),
      start: event.start,
      end: event.end,
      link,
    };
  }

  const shadow = name.match(/^Shadow (.*?) in Shadow Raids$/i);

  if (shadow) {
    return {
      eventID: event.eventID,
      category: "shadow",
      label: raidCategoryLabel("shadow"),
      boss: shadow[1].trim(),
      start: event.start,
      end: event.end,
      link,
    };
  }

  const mega = name.match(/^Mega (.*?) in Mega Raids$/i);

  if (mega) {
    return {
      eventID: event.eventID,
      category: "mega",
      label: raidCategoryLabel("mega"),
      boss: mega[1].trim(),
      start: event.start,
      end: event.end,
      link,
    };
  }

  return null;
}

export function selectRaidBossEvents(
  events: PokemonGoEventSummary[],
): RaidBossTickerItem[] {
  return events
    .filter((event) => event.eventType.toLowerCase() === "raid-battles")
    .map(raidBossItem)
    .filter((item): item is RaidBossTickerItem => item !== null);
}

const categoryOrder: Record<RaidCategory, number> = {
  "five-star": 0,
  shadow: 1,
  mega: 2,
};

function sortRaidItems(items: RaidBossTickerItem[]): RaidBossTickerItem[] {
  return items.sort((left, right) => {
    const categoryDifference =
      categoryOrder[left.category] - categoryOrder[right.category];

    if (categoryDifference !== 0) return categoryDifference;

    const startDifference = left.start.localeCompare(right.start);
    return startDifference !== 0
      ? startDifference
      : left.boss.localeCompare(right.boss);
  });
}

export function selectCurrentRaidBosses(
  events: PokemonGoEventSummary[],
  now: Date = new Date(),
): RaidBossTickerItem[] {
  return sortRaidItems(
    selectRaidBossEvents(events).filter((item) => {
      const event = {
        start: item.start,
        end: item.end,
      } as PokemonGoEventSummary;
      return isActiveAt(event, now);
    }),
  );
}

export function selectNextRaidBosses(
  events: PokemonGoEventSummary[],
  now: Date = new Date(),
  noticeWindowMs: number = RAID_NEXT_NOTICE_WINDOW_MS,
): RaidBossTickerItem[] {
  const future = selectRaidBossEvents(events).filter((item) => {
    const startMs = parseEventDate(item.start).getTime();
    const nowMs = comparisonNowMs(now, item.start);
    const windowEnd = nowMs + noticeWindowMs;
    return Number.isFinite(startMs) && startMs > nowMs && startMs <= windowEnd;
  });
  const firstStartByCategory = new Map<RaidCategory, number>();

  for (const item of future) {
    const startMs = parseEventDate(item.start).getTime();
    const existing = firstStartByCategory.get(item.category);
    if (existing === undefined || startMs < existing) {
      firstStartByCategory.set(item.category, startMs);
    }
  }

  return sortRaidItems(
    future
      .filter(
        (item) =>
          parseEventDate(item.start).getTime() ===
          firstStartByCategory.get(item.category),
      )
      .map((item) => ({ ...item, state: "next" as const })),
  );
}
