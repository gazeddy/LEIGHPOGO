import {
  getEventDestination,
  type PokemonGoEventSummary,
  type PokemonGoRaidScheduleEntry,
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

const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const MONTH_INDEX: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};

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
    end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate(),
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

function dateOnlyUtc(value: string): Date | null {
  const match = value.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function formatDateKey(date: Date): string {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function resolveScheduleDate(
  event: PokemonGoEventSummary,
  dateText: string,
): string | null {
  const eventStart = dateOnlyUtc(event.start);
  const eventEnd = dateOnlyUtc(event.end);
  if (!eventStart || !eventEnd) return null;

  const trimmed = dateText.trim();
  const weekday = WEEKDAY_INDEX[trimmed.toLowerCase()];
  if (weekday !== undefined) {
    const cursor = new Date(eventStart);
    while (cursor.getTime() <= eventEnd.getTime()) {
      if (cursor.getUTCDay() === weekday) return formatDateKey(cursor);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return null;
  }

  const fullDate = trimmed.match(
    /^(?:(?:Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday),?\s+)?(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:,\s*(\d{4}))?$/i,
  );
  if (!fullDate) return null;

  const month = MONTH_INDEX[fullDate[1].toLowerCase()];
  const day = Number(fullDate[2]);
  const explicitYear = fullDate[3] ? Number(fullDate[3]) : null;
  const years = explicitYear === null
    ? Array.from(new Set([eventStart.getUTCFullYear(), eventEnd.getUTCFullYear()]))
    : [explicitYear];

  for (const year of years) {
    const candidate = new Date(Date.UTC(year, month, day));
    if (
      candidate.getUTCFullYear() === year &&
      candidate.getUTCMonth() === month &&
      candidate.getUTCDate() === day &&
      candidate.getTime() >= eventStart.getTime() &&
      candidate.getTime() <= eventEnd.getTime()
    ) {
      return formatDateKey(candidate);
    }
  }

  return null;
}

function parseClock(hourText: string, minuteText: string | undefined, meridiem: string): number {
  let hour = Number(hourText) % 12;
  if (meridiem.toLowerCase() === "pm") hour += 12;
  return hour * 60 + Number(minuteText ?? "0");
}

function parseScheduleTimeRange(value: string | null): { start: number; end: number } | null {
  if (!value) return null;
  const normalised = value.toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim();
  const match = normalised.match(
    /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*(?:to|[-–—])\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i,
  );
  if (!match) return null;

  return {
    start: parseClock(match[1], match[2], match[3]),
    end: parseClock(match[4], match[5], match[6]),
  };
}

function wallClockAt(dateKey: string, minutes: number): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, Math.floor(minutes / 60), minutes % 60));
}

function formatWallClock(date: Date): string {
  return `${formatDateKey(date)}T${String(date.getUTCHours()).padStart(2, "0")}:${String(
    date.getUTCMinutes(),
  ).padStart(2, "0")}:${String(date.getUTCSeconds()).padStart(2, "0")}.${String(
    date.getUTCMilliseconds(),
  ).padStart(3, "0")}`;
}

function scheduleWindow(
  event: PokemonGoEventSummary,
  entry: PokemonGoRaidScheduleEntry,
): { start: string; end: string } | null {
  const dateKey = resolveScheduleDate(event, entry.date);
  if (!dateKey) return null;

  const timeRange = parseScheduleTimeRange(entry.time);
  let start = wallClockAt(dateKey, timeRange?.start ?? 0);
  let end = wallClockAt(dateKey, timeRange?.end ?? 24 * 60);

  if (timeRange && timeRange.end <= timeRange.start) {
    end.setUTCDate(end.getUTCDate() + 1);
  }

  const parentStart = parseEventDate(event.start);
  const parentEnd = parseEventDate(event.end);
  if (Number.isNaN(parentStart.getTime()) || Number.isNaN(parentEnd.getTime())) return null;

  if (start.getTime() < parentStart.getTime()) start = parentStart;
  if (end.getTime() > parentEnd.getTime()) end = parentEnd;
  if (start.getTime() >= end.getTime()) return null;

  return {
    start: formatWallClock(start),
    end: formatWallClock(end),
  };
}

function isFiveStarRaidType(value: string): boolean {
  return /(?:tier\s*[56]|[56]\s*-?\s*star|five\s*-?\s*star|legendary)/i.test(value);
}

function scheduleBossCategory(name: string, raidType: string | null): RaidCategory | null {
  const type = raidType?.trim() ?? "";
  if (/mega/i.test(type) || (!type && /^mega\b/i.test(name))) return "mega";
  if (/shadow/i.test(type) && isFiveStarRaidType(type)) return "shadow";
  if (isFiveStarRaidType(type)) return "five-star";
  return null;
}

function displayScheduleBoss(name: string, category: RaidCategory): string {
  if (category === "mega") return name.replace(/^Mega\s+/i, "").trim();
  if (category === "shadow") return name.replace(/^Shadow\s+/i, "").trim();
  return name.trim();
}

function eventIdPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "raid";
}

function scheduledRaidBossItems(event: PokemonGoEventSummary): RaidBossTickerItem[] {
  const schedule = event.raidSchedule ?? [];
  if (schedule.length === 0) return [];

  return schedule.flatMap((entry, index) => {
    const window = scheduleWindow(event, entry);
    if (!window) return [];

    const bossesByCategory = new Map<RaidCategory, string[]>();
    for (const boss of entry.bosses) {
      const category = scheduleBossCategory(boss.name, boss.raidType);
      if (!category) continue;
      const displayName = displayScheduleBoss(boss.name, category);
      const names = bossesByCategory.get(category) ?? [];
      if (!names.includes(displayName)) names.push(displayName);
      bossesByCategory.set(category, names);
    }

    return Array.from(bossesByCategory.entries()).map(([category, bosses]) => ({
      eventID: `${event.eventID}--raid-${eventIdPart(entry.date)}-${eventIdPart(
        entry.time ?? `slot-${index + 1}`,
      )}-${category}`,
      category,
      label: raidCategoryLabel(category),
      boss: bosses.join(", "),
      start: window.start,
      end: window.end,
      link: getEventDestination(event),
    }));
  });
}

export function selectRaidBossEvents(
  events: PokemonGoEventSummary[],
): RaidBossTickerItem[] {
  return events.flatMap((event) => {
    const scheduled = scheduledRaidBossItems(event);
    if (scheduled.length > 0) return scheduled;

    if (event.eventType.toLowerCase() !== "raid-battles") return [];
    const legacy = raidBossItem(event);
    return legacy ? [legacy] : [];
  });
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
