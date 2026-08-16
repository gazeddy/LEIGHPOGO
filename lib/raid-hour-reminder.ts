import type { RaidBossTickerItem } from "./events";

export const DEFAULT_PUSH_TIME_ZONE = "Europe/London";

export interface RaidHourLocalState {
  dateKey: string;
  weekday: string;
  hour: number;
  minute: number;
  timeZone: string;
}

export interface RaidHourPushPayload {
  title: string;
  body: string;
  tag: string;
  renotify: boolean;
  url: string;
}

export function normalisePushTimeZone(value: unknown): string {
  const timeZone = typeof value === "string" ? value.trim() : "";
  if (!timeZone) return DEFAULT_PUSH_TIME_ZONE;

  try {
    new Intl.DateTimeFormat("en-GB", { timeZone }).format(new Date(0));
    return timeZone;
  } catch {
    return DEFAULT_PUSH_TIME_ZONE;
  }
}

export function getRaidHourLocalState(
  now: Date,
  suppliedTimeZone: unknown,
): RaidHourLocalState {
  const timeZone = normalisePushTimeZone(suppliedTimeZone);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return {
    dateKey: `${values.year}-${values.month}-${values.day}`,
    weekday: values.weekday || "",
    hour: Number(values.hour),
    minute: Number(values.minute),
    timeZone,
  };
}

export function isWednesdayRaidHour(
  now: Date,
  suppliedTimeZone: unknown,
): boolean {
  const local = getRaidHourLocalState(now, suppliedTimeZone);
  return local.weekday === "Wed" && local.hour === 18;
}

export function buildRaidHourPushPayload(
  item: RaidBossTickerItem,
  dateKey: string,
  hundoLabel: "Hundo" | "15/15/15" = "Hundo",
): RaidHourPushPayload | null {
  const catchCp = (item.catchCp ?? []).filter(
    (boss) =>
      Number.isFinite(boss.maxUnboostedCp) &&
      Number.isFinite(boss.maxBoostedCp),
  );

  if (catchCp.length === 0) return null;

  if (catchCp.length === 1) {
    const boss = catchCp[0];
    return {
      title: `5★ Raid Hour: ${boss.boss}`,
      body: `${hundoLabel}: ${boss.maxUnboostedCp} CP • Weather boosted: ${boss.maxBoostedCp} CP`,
      tag: `raid-hour-${dateKey}`,
      renotify: false,
      url: item.link || "/tools/raids#raid-five-star",
    };
  }

  return {
    title: "5★ Raid Hour",
    body: catchCp
      .map(
        (boss) =>
          `${boss.boss} — ${hundoLabel}: ${boss.maxUnboostedCp} CP / ${boss.maxBoostedCp} CP WB`,
      )
      .join(" • "),
    tag: `raid-hour-${dateKey}`,
    renotify: false,
    url: item.link || "/tools/raids#raid-five-star",
  };
}