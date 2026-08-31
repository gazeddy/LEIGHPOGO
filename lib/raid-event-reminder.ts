import { selectRaidBossEvents } from "./event-selection";
import type {
  PokemonGoEventSummary,
  RaidBossTickerItem,
  RaidCategory,
} from "./events";

export const RAID_EVENT_REMINDER_LEAD_MINUTES = 30;
export const RAID_EVENT_REMINDER_KIND = "START_30_MIN";

export interface RaidEventBossSummary {
  name: string;
  maxUnboostedCp: number | null;
  maxBoostedCp: number | null;
}

export interface RaidEventPushPayload {
  title: string;
  body: string;
  tag: string;
  renotify: boolean;
  url: string;
}

function hasExplicitTimeZone(value: string): boolean {
  return /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
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

function wallClockComparison(startValue: string, now: Date): {
  startMs: number;
  nowMs: number;
} {
  const startMs = new Date(
    hasExplicitTimeZone(startValue) ? startValue : `${startValue}Z`,
  ).getTime();
  const nowMs = hasExplicitTimeZone(startValue)
    ? now.getTime()
    : londonWallClockMs(now);
  return { startMs, nowMs };
}

function eventStartsOnWeekend(event: PokemonGoEventSummary): boolean {
  const start = new Date(
    hasExplicitTimeZone(event.start) ? event.start : `${event.start}Z`,
  );
  if (Number.isNaN(start.getTime())) return false;

  if (!hasExplicitTimeZone(event.start)) {
    return start.getUTCDay() === 0 || start.getUTCDay() === 6;
  }

  const weekday = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
  }).format(start);
  return weekday === "Sat" || weekday === "Sun";
}

function isExplicitShadowRaidEvent(event: PokemonGoEventSummary): boolean {
  return /\bshadow\b/i.test(
    [event.name, event.heading, ...(event.tags ?? [])].filter(Boolean).join(" "),
  );
}

function supportedScheduledItems(event: PokemonGoEventSummary): RaidBossTickerItem[] {
  const shadowEvent = isExplicitShadowRaidEvent(event);
  return selectRaidBossEvents([event]).filter(
    (item) =>
      item.category === "five-star" ||
      item.category === "mega" ||
      (item.category === "shadow" && shadowEvent),
  );
}

export function raidEventReminderStart(event: PokemonGoEventSummary): string {
  const scheduled = supportedScheduledItems(event);
  if (scheduled.length === 0) return event.start;
  return scheduled
    .map((item) => item.start)
    .sort((left, right) => left.localeCompare(right))[0];
}

export function isSupportedRaidEvent(event: PokemonGoEventSummary): boolean {
  const type = event.eventType.trim().toLowerCase();
  if (type === "raid-hour" || type === "raid-day") return true;
  if (type === "raid-battles") return false;

  // GO Fest, GO Wild and similar weekend events can carry their raid lineup in
  // raidSchedule even when the event name itself does not contain "raid".
  if (eventStartsOnWeekend(event) && supportedScheduledItems(event).length > 0) {
    return true;
  }

  const hasRaidTag = (event.tags ?? []).some(
    (tag) => tag.trim().toLowerCase() === "raid",
  );
  return hasRaidTag && /\braid\b/i.test(event.name);
}

export function isRaidEventReminderDue(
  event: PokemonGoEventSummary,
  now: Date = new Date(),
  leadMinutes: number = RAID_EVENT_REMINDER_LEAD_MINUTES,
): boolean {
  if (!isSupportedRaidEvent(event)) return false;
  const { startMs, nowMs } = wallClockComparison(raidEventReminderStart(event), now);
  if (!Number.isFinite(startMs) || !Number.isFinite(nowMs)) return false;

  const remainingMs = startMs - nowMs;
  return remainingMs > 0 && remainingMs <= Math.max(1, leadMinutes) * 60 * 1000;
}

function stripGenericPokemonGoPrefix(value: string): string {
  return value
    .replace(/^pok[eé]mon\s+go\s*[:\-–—]\s*/i, "")
    .trim();
}

export function raidEventLabel(event: PokemonGoEventSummary): string {
  const type = event.eventType.trim().toLowerCase();
  if (type === "raid-hour") return "Raid Hour";
  if (type === "raid-day") return "Raid Day";
  if (supportedScheduledItems(event).length > 0) {
    return stripGenericPokemonGoPrefix(event.name) || "Raid event";
  }
  return event.heading?.trim() || "Raid event";
}

export function raidEventBossText(event: PokemonGoEventSummary): string | null {
  const label = raidEventLabel(event);
  let value = stripGenericPokemonGoPrefix(event.name.trim());
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  value = value
    .replace(new RegExp(`^${escapedLabel}\\s*[:\\-–—]?\\s*`, "i"), "")
    .replace(new RegExp(`\\s*[:\\-–—]?\\s*${escapedLabel}$`, "i"), "")
    .trim();

  if (!value || /^(?:raid\s*(?:hour|day|event)?)$/i.test(value)) return null;
  return value;
}

export function splitRaidEventBosses(value: string): string[] {
  return value
    .replace(/\s+(?:and|&)\s+/gi, ",")
    .replace(/\s*\/\s*/g, ",")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function inferRaidCategory(boss: string): RaidCategory {
  if (/^mega\b/i.test(boss.trim())) return "mega";
  if (/^shadow\b/i.test(boss.trim())) return "shadow";
  return "five-star";
}

export function raidEventBossItems(event: PokemonGoEventSummary): RaidBossTickerItem[] {
  const scheduled = supportedScheduledItems(event);
  if (scheduled.length > 0) {
    const earliestStart = raidEventReminderStart(event);
    return scheduled.filter((item) => item.start === earliestStart);
  }

  const bossText = raidEventBossText(event);
  if (!bossText) return [];

  return splitRaidEventBosses(bossText).map((boss, index) => {
    const category = inferRaidCategory(boss);
    return {
      eventID: `${event.eventID}:push:${index}`,
      category,
      label:
        category === "mega"
          ? "Mega"
          : category === "shadow"
            ? "Shadow 5★"
            : "5★",
      boss,
      start: event.start,
      end: event.end,
      link: `/events?event=${encodeURIComponent(event.eventID)}`,
    };
  });
}

export function selectCurrentFiveStarRaidItems(
  items: RaidBossTickerItem[],
): RaidBossTickerItem[] {
  return items.filter(
    (item) => item.category === "five-star" && item.state === "current",
  );
}

function uniqueBosses(bosses: RaidEventBossSummary[]): RaidEventBossSummary[] {
  const seen = new Set<string>();
  return bosses.filter((boss) => {
    const key = boss.name.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function bossCpLine(boss: RaidEventBossSummary, easterEgg: boolean): string {
  if (easterEgg) return `${boss.name}: Hundo - 15/15/15`;

  const hasCp =
    Number.isFinite(boss.maxUnboostedCp) && Number.isFinite(boss.maxBoostedCp);
  if (!hasCp) return `${boss.name}: CP pending`;

  return `${boss.name}: Hundo ${boss.maxUnboostedCp} CP • WB ${boss.maxBoostedCp} CP`;
}

export function buildRaidEventPushPayload(
  event: PokemonGoEventSummary,
  bosses: RaidEventBossSummary[],
  easterEgg = false,
): RaidEventPushPayload | null {
  const resolved = uniqueBosses(bosses);
  if (resolved.length === 0) return null;

  const label = raidEventLabel(event);
  const url = `/events?event=${encodeURIComponent(event.eventID)}`;

  if (resolved.length === 1) {
    const boss = resolved[0];
    const hasCp =
      Number.isFinite(boss.maxUnboostedCp) && Number.isFinite(boss.maxBoostedCp);
    const body = easterEgg
      ? "Starts in 30 minutes • Hundo - 15/15/15"
      : hasCp
        ? `Starts in 30 minutes • Hundo: ${boss.maxUnboostedCp} CP • Weather boosted: ${boss.maxBoostedCp} CP`
        : "Starts in 30 minutes • CP pending";

    return {
      title: `${label}: ${boss.name}`,
      body,
      tag: `raid-event-${event.eventID}`,
      renotify: false,
      url,
    };
  }

  const visible = resolved.slice(0, 12);
  const lines = visible.map((boss) => bossCpLine(boss, easterEgg));
  if (resolved.length > visible.length) {
    lines.push(`+${resolved.length - visible.length} more — open event`);
  }

  return {
    title: `${label} starts in 30 minutes`,
    body: lines.join("\n"),
    tag: `raid-event-${event.eventID}`,
    renotify: false,
    url,
  };
}

export function raidEventDateKey(event: PokemonGoEventSummary): string {
  const match = raidEventReminderStart(event).match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] || event.eventID;
}
