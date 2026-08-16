import crypto from "node:crypto";
import prisma from "./prisma";
import { getRaidToolsData } from "./raid-boss-history";
import {
  buildRaidHourPushPayload,
  getRaidHourLocalState,
  isWednesdayRaidHour,
} from "./raid-hour-reminder";
import { isWebPushConfigured, sendWebPush } from "./webPush";

export const RAID_HOUR_EASTER_EGG_ONE_IN = 100;
export const RAID_HOUR_EASTER_EGG_COOLDOWN_WEEKS = 4;
export const RAID_HOUR_EASTER_EGG_USAGE_TYPE = "RAID_HOUR_EASTER_EGG";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface RaidHourPushResult {
  configured: boolean;
  due: number;
  sent: number;
  failed: number;
  removed: number;
  claimedElsewhere: number;
  bosses: string[];
  reason: string | null;
}

interface DueSubscription {
  subscription: {
    id: number;
    ownerId: number;
    endpoint: string;
    p256dh: string;
    auth: string;
    timeZone: string;
    lastRaidHourReminderKey: string | null;
  };
  dateKey: string;
}

interface SendResult {
  state: "sent" | "failed" | "removed" | "claimed";
  ownerId: number;
  dateKey: string;
  easterEgg: boolean;
}

const emptyResult = (
  configured: boolean,
  reason: string | null = null,
): RaidHourPushResult => ({
  configured,
  due: 0,
  sent: 0,
  failed: 0,
  removed: 0,
  claimedElsewhere: 0,
  bosses: [],
  reason,
});

function dateKeyTime(dateKey: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  const value = Date.parse(`${dateKey}T00:00:00.000Z`);
  return Number.isFinite(value) ? value : null;
}

export function isRaidHourEasterEggOwnerEligible(
  dateKey: string,
  lastSelectedDateKey: string | null | undefined,
  cooldownWeeks: number = RAID_HOUR_EASTER_EGG_COOLDOWN_WEEKS,
): boolean {
  if (!lastSelectedDateKey || lastSelectedDateKey === dateKey) return true;

  const current = dateKeyTime(dateKey);
  const previous = dateKeyTime(lastSelectedDateKey);
  if (current === null || previous === null) return true;
  if (current <= previous) return false;

  return current - previous > Math.max(0, cooldownWeeks) * WEEK_MS;
}

export function selectRaidHourEasterEggOwner(
  dateKey: string,
  ownerIds: number[],
  secret: string,
  oneIn: number = RAID_HOUR_EASTER_EGG_ONE_IN,
): number | null {
  const uniqueOwnerIds = Array.from(
    new Set(ownerIds.filter((ownerId) => Number.isInteger(ownerId))),
  ).sort((left, right) => left - right);
  const safeOneIn = Math.max(1, Math.floor(oneIn));
  const seed = String(secret || "").trim();

  if (!seed || uniqueOwnerIds.length === 0) return null;

  const digest = crypto
    .createHmac("sha256", seed)
    .update(`raid-hour-easter-egg:${dateKey}`)
    .digest();

  if (digest.readUInt32BE(0) % safeOneIn !== 0) return null;

  return uniqueOwnerIds[digest.readUInt32BE(4) % uniqueOwnerIds.length];
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

export async function sendWednesdayRaidHourPush(
  now: Date = new Date(),
): Promise<RaidHourPushResult> {
  if (!isWebPushConfigured()) {
    return emptyResult(false, "Web Push is not configured.");
  }

  const subscriptions = await prisma.pushSubscription.findMany({
    select: {
      id: true,
      ownerId: true,
      endpoint: true,
      p256dh: true,
      auth: true,
      timeZone: true,
      lastRaidHourReminderKey: true,
    },
  });

  const due: DueSubscription[] = subscriptions.flatMap((subscription: any) => {
    if (!isWednesdayRaidHour(now, subscription.timeZone)) return [];
    const local = getRaidHourLocalState(now, subscription.timeZone);
    if (subscription.lastRaidHourReminderKey === local.dateKey) return [];
    return [{ subscription, dateKey: local.dateKey }];
  });

  if (due.length === 0) {
    return emptyResult(true, "No subscribed devices are due a raid-hour reminder.");
  }

  const raidTools = await getRaidToolsData(now);
  const fiveStar = raidTools.tickerItems.find(
    (item) => item.category === "five-star" && item.state === "current",
  );

  if (!fiveStar) {
    return {
      ...emptyResult(true, "No current five-star raid boss is available."),
      due: due.length,
    };
  }

  const bosses = (fiveStar.catchCp ?? []).map((entry) => entry.boss);
  const payloadByDate = new Map<string, ReturnType<typeof buildRaidHourPushPayload>>();
  const easterEggPayloadByDate = new Map<
    string,
    ReturnType<typeof buildRaidHourPushPayload>
  >();
  const easterEggOwnerByDate = new Map<string, number | null>();
  const allOwnerIds = Array.from(
    new Set(subscriptions.map((subscription: any) => subscription.ownerId)),
  );
  const schedulerSecret = String(process.env.RAID_HOUR_CRON_SECRET || "").trim();

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
    select: {
      ownerId: true,
      metadata: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const lastEasterEggDateByOwner = new Map<number, string>();
  for (const event of recentEasterEggs as any[]) {
    if (!Number.isInteger(event.ownerId) || lastEasterEggDateByOwner.has(event.ownerId)) {
      continue;
    }
    const dateKey = easterEggDateKeyFromMetadata(event.metadata);
    if (dateKey) lastEasterEggDateByOwner.set(event.ownerId, dateKey);
  }

  for (const entry of due) {
    if (!payloadByDate.has(entry.dateKey)) {
      payloadByDate.set(
        entry.dateKey,
        buildRaidHourPushPayload(fiveStar, entry.dateKey),
      );
      easterEggPayloadByDate.set(
        entry.dateKey,
        buildRaidHourPushPayload(fiveStar, entry.dateKey, true),
      );

      const eligibleOwnerIds = allOwnerIds.filter((ownerId) =>
        isRaidHourEasterEggOwnerEligible(
          entry.dateKey,
          lastEasterEggDateByOwner.get(ownerId),
        ),
      );

      easterEggOwnerByDate.set(
        entry.dateKey,
        selectRaidHourEasterEggOwner(
          entry.dateKey,
          eligibleOwnerIds,
          schedulerSecret,
        ),
      );
    }
  }

  if (Array.from(payloadByDate.values()).every((payload) => payload === null)) {
    return {
      ...emptyResult(true, "The current five-star boss has no hundo CP data."),
      due: due.length,
      bosses,
    };
  }

  const results: SendResult[] = await Promise.all(
    due.map(async ({ subscription, dateKey }): Promise<SendResult> => {
      const isEasterEggRecipient =
        easterEggOwnerByDate.get(dateKey) === subscription.ownerId;
      const payload = isEasterEggRecipient
        ? easterEggPayloadByDate.get(dateKey)
        : payloadByDate.get(dateKey);
      const baseResult = {
        ownerId: subscription.ownerId,
        dateKey,
        easterEgg: isEasterEggRecipient,
      };

      if (!payload) return { ...baseResult, state: "failed" };

      const claim = await prisma.pushSubscription.updateMany({
        where: {
          id: subscription.id,
          OR: [
            { lastRaidHourReminderKey: null },
            { lastRaidHourReminderKey: { not: dateKey } },
          ],
        },
        data: { lastRaidHourReminderKey: dateKey },
      });

      if (claim.count === 0) {
        return { ...baseResult, state: "claimed" };
      }

      try {
        const result = await sendWebPush(
          {
            endpoint: subscription.endpoint,
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
          payload,
          { ttl: 60 * 60 },
        );

        if (result.ok) return { ...baseResult, state: "sent" };

        if (result.expired) {
          await prisma.pushSubscription.deleteMany({
            where: { id: subscription.id },
          });
          return { ...baseResult, state: "removed" };
        }

        await prisma.pushSubscription.updateMany({
          where: {
            id: subscription.id,
            lastRaidHourReminderKey: dateKey,
          },
          data: {
            lastRaidHourReminderKey: subscription.lastRaidHourReminderKey,
          },
        });
        return { ...baseResult, state: "failed" };
      } catch (error) {
        console.error(
          "Unable to send Wednesday Raid Hour push notification:",
          error instanceof Error ? error.message : error,
        );
        await prisma.pushSubscription.updateMany({
          where: {
            id: subscription.id,
            lastRaidHourReminderKey: dateKey,
          },
          data: {
            lastRaidHourReminderKey: subscription.lastRaidHourReminderKey,
          },
        });
        return { ...baseResult, state: "failed" };
      }
    }),
  );

  const successfulEasterEggs = new Map<string, { ownerId: number; dateKey: string }>();
  for (const result of results) {
    if (result.state !== "sent" || !result.easterEgg) continue;
    successfulEasterEggs.set(`${result.ownerId}:${result.dateKey}`, {
      ownerId: result.ownerId,
      dateKey: result.dateKey,
    });
  }

  await Promise.all(
    Array.from(successfulEasterEggs.values()).map(({ ownerId, dateKey }) =>
      prisma.usageEvent.create({
        data: {
          type: RAID_HOUR_EASTER_EGG_USAGE_TYPE,
          ownerId,
          metadata: JSON.stringify({ dateKey }),
        },
      }),
    ),
  );

  return {
    configured: true,
    due: due.length,
    sent: results.filter((result) => result.state === "sent").length,
    failed: results.filter((result) => result.state === "failed").length,
    removed: results.filter((result) => result.state === "removed").length,
    claimedElsewhere: results.filter((result) => result.state === "claimed").length,
    bosses,
    reason: null,
  };
}
