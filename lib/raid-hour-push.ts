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
  const allOwnerIds = subscriptions.map((subscription: any) => subscription.ownerId);
  const schedulerSecret = String(process.env.RAID_HOUR_CRON_SECRET || "").trim();

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
      easterEggOwnerByDate.set(
        entry.dateKey,
        selectRaidHourEasterEggOwner(
          entry.dateKey,
          allOwnerIds,
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

  const results = await Promise.all(
    due.map(async ({ subscription, dateKey }) => {
      const isEasterEggRecipient =
        easterEggOwnerByDate.get(dateKey) === subscription.ownerId;
      const payload = isEasterEggRecipient
        ? easterEggPayloadByDate.get(dateKey)
        : payloadByDate.get(dateKey);
      if (!payload) return { state: "failed" as const };

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
        return { state: "claimed" as const };
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

        if (result.ok) return { state: "sent" as const };

        if (result.expired) {
          await prisma.pushSubscription.deleteMany({
            where: { id: subscription.id },
          });
          return { state: "removed" as const };
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
        return { state: "failed" as const };
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
        return { state: "failed" as const };
      }
    }),
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