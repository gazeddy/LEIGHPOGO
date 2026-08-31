import prisma from "./prisma";
import { getRaidToolsData } from "./raid-boss-history";
import type { RaidBossTickerItem } from "./events";
import { isWebPushConfigured, sendWebPush } from "./webPush";

export const DAILY_RAID_SUMMARY_USAGE_TYPE = "DAILY_RAID_SUMMARY_SENT";
export const DAILY_RAID_SUMMARY_HOUR = 18;
export const DAILY_RAID_SUMMARY_KIND = "DAILY_18:00";

const DELIVERY_HISTORY_MS = 3 * 24 * 60 * 60 * 1000;

export interface DailyRaidSummaryResult {
  configured: boolean;
  due: boolean;
  sent: number;
  failed: number;
  removed: number;
  alreadySent: number;
  fiveStarBosses: string[];
  eventBosses: string[];
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

function tickerBossNames(item: RaidBossTickerItem): string[] {
  if (item.catchCp && item.catchCp.length > 0) {
    return item.catchCp
      .map((boss) => displayNameForCategory(boss.boss, item))
      .filter(Boolean);
  }

  return item.boss
    .replace(/\s+(?:and|&)\s+/gi, ",")
    .replace(/\s*\/\s*/g, ",")
    .split(",")
    .map((name) => displayNameForCategory(name, item))
    .filter(Boolean);
}

function uniqueNames(names: string[]): string[] {
  const seen = new Set<string>();
  return names.filter((name) => {
    const key = normaliseName(name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function selectDailyRaidSummaryBosses(items: RaidBossTickerItem[]): {
  fiveStarBosses: string[];
  eventBosses: string[];
} {
  const current = items.filter((item) => item.state === "current");
  const fiveStarBosses = uniqueNames(
    current
      .filter((item) => item.category === "five-star")
      .flatMap(tickerBossNames),
  );
  const fiveStarKeys = new Set(fiveStarBosses.map(normaliseName));

  // Derived raid-schedule entries use --raid- IDs. These are event-specific
  // rotations such as Mega Ascension or GO Fest habitat raid pools.
  const eventBosses = uniqueNames(
    current
      .filter((item) => item.eventID.includes("--raid-"))
      .flatMap(tickerBossNames)
      .filter((name) => !fiveStarKeys.has(normaliseName(name))),
  );

  return { fiveStarBosses, eventBosses };
}

function compactBossList(names: string[], maxNames = 12): string {
  if (names.length <= maxNames) return names.join(", ");
  return `${names.slice(0, maxNames).join(", ")} +${names.length - maxNames} more`;
}

export function buildDailyRaidSummaryPayload(
  dateKey: string,
  fiveStarBosses: string[],
  eventBosses: string[],
  test = false,
) {
  const lines: string[] = [];
  if (fiveStarBosses.length > 0) {
    lines.push(`5★: ${compactBossList(fiveStarBosses)}`);
  }
  if (eventBosses.length > 0) {
    lines.push(`Event: ${compactBossList(eventBosses)}`);
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
      ...emptyResult(true, due, "No current five-star or event raid bosses were found."),
      fiveStarBosses,
      eventBosses,
    };
  }
  if (subscriptions.length === 0) {
    return {
      ...emptyResult(true, due, "No devices are subscribed to push notifications."),
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

  for (const subscription of subscriptions as any[]) {
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
