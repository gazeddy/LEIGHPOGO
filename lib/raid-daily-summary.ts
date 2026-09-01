import prisma from "./prisma";
import { getRaidToolsData } from "./raid-boss-history";
import type { RaidBossTickerItem } from "./events";
import {
  PUSH_PREFERENCE_KEYS,
  enabledPushOwnerIds,
} from "./pushPreferences";
import { isWebPushConfigured, sendWebPush } from "./webPush";

export const DAILY_RAID_SUMMARY_USAGE_TYPE = "DAILY_RAID_SUMMARY_SENT";
export const DAILY_RAID_SUMMARY_HOUR = 18;
export const DAILY_RAID_SUMMARY_KIND = "DAILY_18:00";

const DELIVERY_HISTORY_MS = 3 * 24 * 60 * 60 * 1000;

export interface DailyRaidSummaryBoss {
  name: string;
  maxUnboostedCp: number | null;
  maxBoostedCp: number | null;
}

export interface DailyRaidSummaryResult {
  configured: boolean;
  due: boolean;
  sent: number;
  failed: number;
  removed: number;
  alreadySent: number;
  fiveStarBosses: DailyRaidSummaryBoss[];
  eventBosses: DailyRaidSummaryBoss[];
  reason: string | null;
}

interface LondonClock {
  dateKey: string;
  hour: number;
  minute: number;
}

interface DeliveryMetadata {
  subscriptionId: number;
  dateKey: string;
  kind: string;
}

function emptyResult(
  configured: boolean,
  due: boolean,
  reason: string | null,
): DailyRaidSummaryResult {
  return {
    configured,
    due,
    sent: 0,
    failed: 0,
    removed: 0,
    alreadySent: 0,
    fiveStarBosses: [],
    eventBosses: [],
    reason,
  };
}

export function londonClock(now: Date): LondonClock {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
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
      .map((part) => [part.type, Number(part.value)]),
  );

  return {
    dateKey: `${values.year}-${String(values.month).padStart(2, "0")}-${String(values.day).padStart(2, "0")}`,
    hour: values.hour,
    minute: values.minute,
  };
}

export function isDailyRaidSummaryDue(now: Date = new Date()): boolean {
  return londonClock(now).hour === DAILY_RAID_SUMMARY_HOUR;
}

function londonWeekday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
  }).format(now);
}

export function isLondonWednesday(now: Date = new Date()): boolean {
  return londonWeekday(now) === "Wed";
}

export function isLondonWeekend(now: Date = new Date()): boolean {
  const weekday = londonWeekday(now);
  return weekday === "Sat" || weekday === "Sun";
}

function isExplicitShadowEventItem(item: RaidBossTickerItem): boolean {
  if (item.category !== "shadow") return false;

  const raidMarkerIndex = item.eventID.indexOf("--raid-");
  if (raidMarkerIndex < 0) return false;

  const eventId = item.eventID.slice(0, raidMarkerIndex);
  return /shadow/i.test(eventId);
}

function isEventSummaryItem(item: RaidBossTickerItem): boolean {
  if (!item.eventID.includes("--raid-")) return false;
  return (
    item.category === "five-star" ||
    item.category === "mega" ||
    isExplicitShadowEventItem(item)
  );
}

export function hasActiveEventRaidBosses(items: RaidBossTickerItem[]): boolean {
  return items.some(
    (item) => item.state === "current" && isEventSummaryItem(item),
  );
}

export function shouldSendDailyRaidSummary(
  items: RaidBossTickerItem[],
  now: Date = new Date(),
): boolean {
  // Weekend raid events are notified before their actual event start instead
  // of generating an evening summary after the event has already begun.
  if (isLondonWeekend(now)) return false;

  if (hasActiveEventRaidBosses(items)) return true;
  if (!isLondonWednesday(now)) return false;
  return items.some(
    (item) => item.state === "current" && item.category === "five-star",
  );
}

function normaliseName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[’']/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function displayNameForCategory(name: string, item: RaidBossTickerItem): string {
  const trimmed = name.trim();
  if (item.category === "mega" && !/^mega\b/i.test(trimmed)) {
    return `Mega ${trimmed}`;
  }
  if (item.category === "shadow" && !/^shadow\b/i.test(trimmed)) {
    return `Shadow ${trimmed}`;
  }
  return trimmed;
}

function tickerBosses(item: RaidBossTickerItem): DailyRaidSummaryBoss[] {
  if (item.catchCp && item.catchCp.length > 0) {
    return item.catchCp
      .map((boss) => ({
        name: displayNameForCategory(boss.boss, item),
        maxUnboostedCp: boss.maxUnboostedCp,
        maxBoostedCp: boss.maxBoostedCp,
      }))
      .filter((boss) => Boolean(boss.name));
  }

  return item.boss
    .replace(/\s+(?:and|&)\s+/gi, ",")
    .replace(/\s*\/\s*/g, ",")
    .split(",")
    .map((name) => ({
      name: displayNameForCategory(name, item),
      maxUnboostedCp: null,
      maxBoostedCp: null,
    }))
    .filter((boss) => Boolean(boss.name));
}

function uniqueBosses(bosses: DailyRaidSummaryBoss[]): DailyRaidSummaryBoss[] {
  const byName = new Map<string, DailyRaidSummaryBoss>();

  for (const boss of bosses) {
    const key = normaliseName(boss.name);
    if (!key) continue;

    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, boss);
      continue;
    }

    const existingHasCp =
      Number.isFinite(existing.maxUnboostedCp) && Number.isFinite(existing.maxBoostedCp);
    const incomingHasCp =
      Number.isFinite(boss.maxUnboostedCp) && Number.isFinite(boss.maxBoostedCp);
    if (!existingHasCp && incomingHasCp) {
      byName.set(key, boss);
    }
  }

  return Array.from(byName.values());
}

export function selectDailyRaidSummaryBosses(items: RaidBossTickerItem[]): {
  fiveStarBosses: DailyRaidSummaryBoss[];
  eventBosses: DailyRaidSummaryBoss[];
} {
  const currentFiveStar = items.filter(
    (item) => item.state === "current" && item.category === "five-star",
  );
  const fiveStarBosses = uniqueBosses(currentFiveStar.flatMap(tickerBosses));
  const fiveStarKeys = new Set(fiveStarBosses.map((boss) => normaliseName(boss.name)));

  const eventBosses = uniqueBosses(
    items
      .filter((item) => item.state === "current" && isEventSummaryItem(item))
      .flatMap(tickerBosses)
      .filter((boss) => !fiveStarKeys.has(normaliseName(boss.name))),
  );

  return { fiveStarBosses, eventBosses };
}

function bossCpLine(boss: DailyRaidSummaryBoss): string {
  const hasCp =
    Number.isFinite(boss.maxUnboostedCp) && Number.isFinite(boss.maxBoostedCp);
  if (!hasCp) return `${boss.name} — CP pending`;
  return `${boss.name} — Hundo ${boss.maxUnboostedCp} CP • WB ${boss.maxBoostedCp} CP`;
}

function compactBossLines(bosses: DailyRaidSummaryBoss[], maxBosses = 12): string[] {
  const visible = bosses.slice(0, maxBosses).map(bossCpLine);
  if (bosses.length > maxBosses) {
    visible.push(`+${bosses.length - maxBosses} more — open Raid Bosses`);
  }
  return visible;
}

export function buildDailyRaidSummaryPayload(
  dateKey: string,
  fiveStarBosses: DailyRaidSummaryBoss[],
  eventBosses: DailyRaidSummaryBoss[],
  test = false,
) {
  const lines: string[] = [];
  if (fiveStarBosses.length > 0) {
    lines.push("5★");
    lines.push(...compactBossLines(fiveStarBosses));
  }
  if (eventBosses.length > 0) {
    lines.push("Event raids");
    lines.push(...compactBossLines(eventBosses));
  }
  if (lines.length === 0) return null;

  return {
    title: test ? "TEST · Raid bosses tonight" : "Raid bosses tonight",
    body: lines.join("\n"),
    tag: test ? `raid-daily-test-${dateKey}` : `raid-daily-${dateKey}`,
    renotify: false,
    url: "/tools/raids",
  };
}

function parseDeliveryMetadata(metadata: string | null): DeliveryMetadata | null {
  if (!metadata) return null;
  try {
    const parsed = JSON.parse(metadata);
    if (
      !Number.isInteger(parsed?.subscriptionId) ||
      typeof parsed?.dateKey !== "string" ||
      typeof parsed?.kind !== "string"
    ) {
      return null;
    }
    return parsed as DeliveryMetadata;
  } catch {
    return null;
  }
}

export async function sendDailyRaidSummary(
  now: Date = new Date(),
  options: { force?: boolean; recordDelivery?: boolean } = {},
): Promise<DailyRaidSummaryResult> {
  const force = options.force === true;
  const recordDelivery = options.recordDelivery !== false;
  const due = force || isDailyRaidSummaryDue(now);

  if (!isWebPushConfigured()) {
    return emptyResult(false, due, "Web Push is not configured.");
  }
  if (!due) {
    return emptyResult(true, false, "Daily raid summary is not due yet.");
  }

  const [raidTools, subscriptions] = await Promise.all([
    getRaidToolsData(now),
    prisma.pushSubscription.findMany({
      select: {
        id: true,
        ownerId: true,
        endpoint: true,
        p256dh: true,
        auth: true,
      },
    }),
  ]);

  if (!shouldSendDailyRaidSummary(raidTools.tickerItems, now)) {
    return emptyResult(
      true,
      due,
      "No weekday event raid lineup or Wednesday 5-star Raid Hour was found; evening raid summary suppressed.",
    );
  }

  const enabledOwners = await enabledPushOwnerIds(
    subscriptions.map((subscription: any) => subscription.ownerId),
    PUSH_PREFERENCE_KEYS.RAIDS,
  );
  const eligibleSubscriptions = subscriptions.filter((subscription: any) =>
    enabledOwners.has(subscription.ownerId),
  );

  const { fiveStarBosses, eventBosses } = selectDailyRaidSummaryBosses(
    raidTools.tickerItems,
  );
  const { dateKey } = londonClock(now);
  const payload = buildDailyRaidSummaryPayload(
    dateKey,
    fiveStarBosses,
    eventBosses,
    force && !recordDelivery,
  );

  if (!payload) {
    return {
      ...emptyResult(true, due, "A qualifying raid night is active, but no supported raid bosses could be resolved."),
      fiveStarBosses,
      eventBosses,
    };
  }
  if (eligibleSubscriptions.length === 0) {
    return {
      ...emptyResult(true, due, "No subscribed devices have Raid alerts enabled."),
      fiveStarBosses,
      eventBosses,
    };
  }

  const sentSubscriptionIds = new Set<number>();
  if (recordDelivery) {
    const recentDeliveries = await prisma.usageEvent.findMany({
      where: {
        type: DAILY_RAID_SUMMARY_USAGE_TYPE,
        createdAt: { gte: new Date(now.getTime() - DELIVERY_HISTORY_MS) },
      },
      select: { metadata: true },
    });

    for (const delivery of recentDeliveries as any[]) {
      const metadata = parseDeliveryMetadata(delivery.metadata);
      if (
        metadata?.kind === DAILY_RAID_SUMMARY_KIND &&
        metadata.dateKey === dateKey
      ) {
        sentSubscriptionIds.add(metadata.subscriptionId);
      }
    }
  }

  let sent = 0;
  let failed = 0;
  let removed = 0;
  let alreadySent = 0;

  for (const subscription of eligibleSubscriptions as any[]) {
    if (recordDelivery && sentSubscriptionIds.has(subscription.id)) {
      alreadySent += 1;
      continue;
    }

    try {
      const result = await sendWebPush(
        {
          endpoint: subscription.endpoint,
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
        payload,
        { ttl: 6 * 60 * 60 },
      );

      if (result.ok) {
        if (recordDelivery) {
          await prisma.usageEvent.create({
            data: {
              type: DAILY_RAID_SUMMARY_USAGE_TYPE,
              ownerId: subscription.ownerId,
              metadata: JSON.stringify({
                subscriptionId: subscription.id,
                dateKey,
                kind: DAILY_RAID_SUMMARY_KIND,
              }),
            },
          });
        }
        sent += 1;
        continue;
      }

      if (result.expired) {
        await prisma.pushSubscription.deleteMany({ where: { id: subscription.id } });
        removed += 1;
        continue;
      }

      failed += 1;
    } catch (error) {
      console.error(
        "Unable to send daily raid summary",
        error instanceof Error ? error.message : error,
      );
      failed += 1;
    }
  }

  return {
    configured: true,
    due,
    sent,
    failed,
    removed,
    alreadySent,
    fiveStarBosses,
    eventBosses,
    reason: null,
  };
}
