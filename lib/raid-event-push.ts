import prisma from "./prisma";
import { getEventsPageData } from "./events-server";
import { getRaidToolsData } from "./raid-boss-history";
import { getCurrentRaidBossProfiles } from "./raid-detail-source";
import {
  RAID_EVENT_REMINDER_KIND,
  buildRaidEventPushPayload,
  isRaidEventReminderDue,
  raidEventBossItems,
  raidEventDateKey,
  type RaidEventBossSummary,
} from "./raid-event-reminder";
import {
  RAID_HOUR_EASTER_EGG_COOLDOWN_WEEKS,
  RAID_HOUR_EASTER_EGG_USAGE_TYPE,
  isRaidHourEasterEggOwnerEligible,
  selectRaidHourEasterEggOwner,
} from "./raid-hour-push";
import type { PokemonGoEventSummary, RaidBossTickerItem } from "./events";
import { isWebPushConfigured, sendWebPush } from "./webPush";

export const RAID_EVENT_PUSH_USAGE_TYPE = "RAID_EVENT_PUSH_SENT";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DELIVERY_HISTORY_MS = 45 * 24 * 60 * 60 * 1000;

export interface RaidEventPushResult {
  configured: boolean;
  dueEvents: number;
  dueDeliveries: number;
  sent: number;
  failed: number;
  removed: number;
  alreadySent: number;
  events: string[];
  bosses: string[];
  reason: string | null;
}

interface ResolvedRaidEvent {
  event: PokemonGoEventSummary;
  bosses: RaidEventBossSummary[];
}

interface DeliveryMetadata {
  subscriptionId: number;
  eventId: string;
  kind: string;
}

const emptyResult = (
  configured: boolean,
  reason: string | null = null,
): RaidEventPushResult => ({
  configured,
  dueEvents: 0,
  dueDeliveries: 0,
  sent: 0,
  failed: 0,
  removed: 0,
  alreadySent: 0,
  events: [],
  bosses: [],
  reason,
});

function deliveryKey(subscriptionId: number, eventId: string): string {
  return `${subscriptionId}|${eventId}|${RAID_EVENT_REMINDER_KIND}`;
}

function parseDeliveryMetadata(metadata: string | null): DeliveryMetadata | null {
  if (!metadata) return null;
  try {
    const parsed = JSON.parse(metadata);
    if (
      !Number.isInteger(parsed?.subscriptionId) ||
      typeof parsed?.eventId !== "string" ||
      typeof parsed?.kind !== "string"
    ) {
      return null;
    }
    return parsed as DeliveryMetadata;
  } catch {
    return null;
  }
}

function easterEggDateKeyFromMetadata(metadata: string | null): string | null {
  if (!metadata) return null;
  try {
    const value = JSON.parse(metadata);
    return typeof value?.dateKey === "string" ? value.dateKey : null;
  } catch {
    return null;
  }
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

async function bossSummariesForTickerItem(
  item: RaidBossTickerItem,
): Promise<RaidEventBossSummary[]> {
  const catchCp = item.catchCp ?? [];
  if (catchCp.length > 0) {
    return catchCp.map((boss) => ({
      name: boss.boss,
      maxUnboostedCp: boss.maxUnboostedCp,
      maxBoostedCp: boss.maxBoostedCp,
    }));
  }

  try {
    const profiles = await getCurrentRaidBossProfiles(item);
    if (profiles.length > 0) {
      return profiles.map((profile) => ({
        name: profile.name,
        maxUnboostedCp: profile.maxUnboostedCp,
        maxBoostedCp: profile.maxBoostedCp,
      }));
    }
  } catch (error) {
    console.error(
      `Unable to resolve raid-event boss data for ${item.boss}`,
      error instanceof Error ? error.message : error,
    );
  }

  return [{
    name: item.boss,
    maxUnboostedCp: null,
    maxBoostedCp: null,
  }];
}

async function resolveRaidEventBosses(
  event: PokemonGoEventSummary,
  now: Date,
): Promise<RaidEventBossSummary[]> {
  const items = raidEventBossItems(event);
  const bosses: RaidEventBossSummary[] = [];

  for (const item of items) {
    bosses.push(...(await bossSummariesForTickerItem(item)));
  }

  if (bosses.length > 0) return uniqueBosses(bosses);

  // Some feeds use a generic "Raid Hour" title. In that case collect every
  // currently active five-star boss, not just the first rotation returned.
  if (event.eventType.trim().toLowerCase() === "raid-hour") {
    try {
      const raidTools = await getRaidToolsData(now);
      const current = raidTools.tickerItems.filter(
        (item) => item.category === "five-star" && item.state === "current",
      );

      const currentBosses: RaidEventBossSummary[] = [];
      for (const item of current) {
        currentBosses.push(...(await bossSummariesForTickerItem(item)));
      }

      return uniqueBosses(currentBosses);
    } catch (error) {
      console.error(
        "Unable to resolve current five-star bosses for generic Raid Hour",
        error instanceof Error ? error.message : error,
      );
    }
  }

  return [];
}

export async function sendRaidEventPushes(
  now: Date = new Date(),
): Promise<RaidEventPushResult> {
  if (!isWebPushConfigured()) {
    return emptyResult(false, "Web Push is not configured.");
  }

  const [eventData, subscriptions] = await Promise.all([
    getEventsPageData(240),
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

  const dueEvents = eventData.events.filter((event) =>
    isRaidEventReminderDue(event, now),
  );

  if (dueEvents.length === 0) {
    return emptyResult(true, "No raid events are due a 30-minute reminder.");
  }

  if (subscriptions.length === 0) {
    return {
      ...emptyResult(true, "No devices are subscribed to push notifications."),
      dueEvents: dueEvents.length,
      events: dueEvents.map((event) => event.name),
    };
  }

  const resolved = (
    await Promise.all(
      dueEvents.map(async (event): Promise<ResolvedRaidEvent | null> => {
        const bosses = await resolveRaidEventBosses(event, now);
        return bosses.length > 0 ? { event, bosses } : null;
      }),
    )
  ).filter((entry): entry is ResolvedRaidEvent => entry !== null);

  if (resolved.length === 0) {
    return {
      ...emptyResult(true, "Raid events are due, but no raid bosses could be resolved."),
      dueEvents: dueEvents.length,
      events: dueEvents.map((event) => event.name),
    };
  }

  const recentDeliveries = await prisma.usageEvent.findMany({
    where: {
      type: RAID_EVENT_PUSH_USAGE_TYPE,
      createdAt: { gte: new Date(now.getTime() - DELIVERY_HISTORY_MS) },
    },
    select: { metadata: true },
  });
  const sentKeys = new Set<string>();
  for (const delivery of recentDeliveries as any[]) {
    const metadata = parseDeliveryMetadata(delivery.metadata);
    if (!metadata || metadata.kind !== RAID_EVENT_REMINDER_KIND) continue;
    sentKeys.add(deliveryKey(metadata.subscriptionId, metadata.eventId));
  }

  const allOwnerIds = Array.from(
    new Set(subscriptions.map((subscription: any) => subscription.ownerId)),
  );
  const recentEasterEggs = await prisma.usageEvent.findMany({
    where: {
      type: RAID_HOUR_EASTER_EGG_USAGE_TYPE,
      ownerId: { in: allOwnerIds },
      createdAt: {
        gte: new Date(
          now.getTime() - (RAID_HOUR_EASTER_EGG_COOLDOWN_WEEKS + 2) * WEEK_MS,
        ),
      },
    },
    select: { ownerId: true, metadata: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  const lastEasterEggDateByOwner = new Map<number, string>();
  for (const entry of recentEasterEggs as any[]) {
    if (!Number.isInteger(entry.ownerId) || lastEasterEggDateByOwner.has(entry.ownerId)) {
      continue;
    }
    const dateKey = easterEggDateKeyFromMetadata(entry.metadata);
    if (dateKey) lastEasterEggDateByOwner.set(entry.ownerId, dateKey);
  }

  const schedulerSecret = String(process.env.RAID_HOUR_CRON_SECRET || "").trim();
  const easterEggOwnerByEvent = new Map<string, number | null>();
  for (const { event } of resolved) {
    if (event.eventType.trim().toLowerCase() !== "raid-hour") continue;
    const dateKey = raidEventDateKey(event);
    const eligibleOwnerIds = allOwnerIds.filter((ownerId) =>
      isRaidHourEasterEggOwnerEligible(
        dateKey,
        lastEasterEggDateByOwner.get(ownerId),
      ),
    );
    easterEggOwnerByEvent.set(
      event.eventID,
      selectRaidHourEasterEggOwner(dateKey, eligibleOwnerIds, schedulerSecret),
    );
  }

  let dueDeliveries = 0;
  let sent = 0;
  let failed = 0;
  let removed = 0;
  let alreadySent = 0;
  const successfulEasterEggs = new Map<string, { ownerId: number; dateKey: string; eventID: string }>();

  for (const { event, bosses } of resolved) {
    for (const subscription of subscriptions as any[]) {
      const key = deliveryKey(subscription.id, event.eventID);
      if (sentKeys.has(key)) {
        alreadySent += 1;
        continue;
      }

      dueDeliveries += 1;
      const isEasterEggRecipient =
        event.eventType.trim().toLowerCase() === "raid-hour" &&
        easterEggOwnerByEvent.get(event.eventID) === subscription.ownerId;
      const payload = buildRaidEventPushPayload(event, bosses, isEasterEggRecipient);
      if (!payload) {
        failed += 1;
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
          { ttl: 30 * 60 },
        );

        if (result.ok) {
          await prisma.usageEvent.create({
            data: {
              type: RAID_EVENT_PUSH_USAGE_TYPE,
              ownerId: subscription.ownerId,
              metadata: JSON.stringify({
                subscriptionId: subscription.id,
                eventId: event.eventID,
                kind: RAID_EVENT_REMINDER_KIND,
              }),
            },
          });
          sentKeys.add(key);
          sent += 1;

          if (isEasterEggRecipient) {
            const dateKey = raidEventDateKey(event);
            successfulEasterEggs.set(`${subscription.ownerId}|${event.eventID}`, {
              ownerId: subscription.ownerId,
              dateKey,
              eventID: event.eventID,
            });
          }
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
          `Unable to send raid-event push for ${event.name}`,
          error instanceof Error ? error.message : error,
        );
        failed += 1;
      }
    }
  }

  await Promise.all(
    Array.from(successfulEasterEggs.values()).map(({ ownerId, dateKey, eventID }) =>
      prisma.usageEvent.create({
        data: {
          type: RAID_HOUR_EASTER_EGG_USAGE_TYPE,
          ownerId,
          metadata: JSON.stringify({ dateKey, eventID }),
        },
      }),
    ),
  );

  return {
    configured: true,
    dueEvents: resolved.length,
    dueDeliveries,
    sent,
    failed,
    removed,
    alreadySent,
    events: resolved.map(({ event }) => event.name),
    bosses: Array.from(
      new Set(resolved.flatMap(({ bosses }) => bosses.map((boss) => boss.name))),
    ),
    reason: null,
  };
}
