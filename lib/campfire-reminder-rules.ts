import type { EventOverride } from "./event-overrides";
import type { PokemonGoEventSummary } from "./events";

export interface CampfireReminderSettings {
  eventTypes: string[];
  excludedEventTypes: string[];
  nameKeywords: string[];
  includeWeekendEvents: boolean;
  updatedAt: string | null;
}

export interface CampfireReminderSettingsInput {
  eventTypes?: string[];
  excludedEventTypes?: string[];
  nameKeywords?: string[];
  includeWeekendEvents?: boolean;
}

export const DEFAULT_CAMPFIRE_REMINDER_SETTINGS: CampfireReminderSettings = {
  eventTypes: ["raid-hour", "raid-day"],
  excludedEventTypes: [],
  nameKeywords: ["go fest"],
  includeWeekendEvents: true,
  updatedAt: null,
};

function londonDateKey(value: string | Date): string | null {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return `${values.year}-${values.month}-${values.day}`;
}

function eventDateKey(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) {
    return londonDateKey(value);
  }

  const includesTimeZone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
  return includesTimeZone ? londonDateKey(value) : value.slice(0, 10);
}

function dateKeyTouchesWeekend(startKey: string, endKey: string): boolean {
  const cursor = new Date(`${startKey}T12:00:00Z`);
  const end = new Date(`${endKey}T12:00:00Z`);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime())) return false;

  // Event feeds should never span anything close to this long. The cap keeps
  // malformed dates from turning a reminder check into an unbounded loop.
  for (let days = 0; cursor <= end && days < 370; days += 1) {
    const weekday = cursor.getUTCDay();
    if (weekday === 0 || weekday === 6) return true;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return false;
}

export function eventTouchesWeekend(event: PokemonGoEventSummary): boolean {
  const startKey = eventDateKey(event.start);
  const endKey = eventDateKey(event.end);
  if (!startKey || !endKey) return false;
  return dateKeyTouchesWeekend(startKey, endKey);
}

export function eventHasCampfireMeetup(
  event: PokemonGoEventSummary,
  override?: EventOverride,
): boolean {
  if (event.campfireUrl?.trim()) return true;
  if (override?.campfireUrl?.trim()) return true;
  return (override?.campfireMeetups ?? []).some((meetup) => Boolean(meetup.url?.trim()));
}

export function eventMatchesCampfireReminderSettings(
  event: PokemonGoEventSummary,
  settings: CampfireReminderSettings,
): boolean {
  const eventType = event.eventType.trim().toLowerCase();
  const configuredTypes = new Set(
    settings.eventTypes.map((value) => value.trim().toLowerCase()).filter(Boolean),
  );
  const excludedTypes = new Set(
    settings.excludedEventTypes.map((value) => value.trim().toLowerCase()).filter(Boolean),
  );

  // Explicit type choices take priority over broad keyword/weekend rules.
  if (configuredTypes.has(eventType)) return true;
  if (excludedTypes.has(eventType)) return false;

  const searchable = [
    event.name,
    event.heading,
    event.eventID,
    ...(event.tags ?? []),
  ]
    .join(" ")
    .toLowerCase();

  if (
    settings.nameKeywords.some((keyword) => {
      const needle = keyword.trim().toLowerCase();
      return Boolean(needle) && searchable.includes(needle);
    })
  ) {
    return true;
  }

  return settings.includeWeekendEvents && eventTouchesWeekend(event);
}

export function eventsMissingCampfireMeetups(
  events: PokemonGoEventSummary[],
  overrides: EventOverride[],
  settings: CampfireReminderSettings,
  now: Date = new Date(),
): PokemonGoEventSummary[] {
  const today = londonDateKey(now);
  const overrideByEventID = new Map(
    overrides.map((override) => [override.eventID, override]),
  );

  return events
    .filter((event) => {
      const endKey = eventDateKey(event.end);
      if (today && endKey && endKey < today) return false;
      if (!eventMatchesCampfireReminderSettings(event, settings)) return false;
      return !eventHasCampfireMeetup(event, overrideByEventID.get(event.eventID));
    })
    .sort((left, right) => left.start.localeCompare(right.start));
}
