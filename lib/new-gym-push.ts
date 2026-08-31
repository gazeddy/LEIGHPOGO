import prisma from "./prisma";
import { PUSH_PREFERENCE_KEYS } from "./pushPreferences";
import { sendPushToUser } from "./pushServer";
import type { GymRecord } from "./gyms";

export interface NewGymPushResult {
  owners: number;
  sent: number;
  failed: number;
  removed: number;
  suppressed: number;
}

export function buildNewGymPushPayload(gyms: GymRecord[]) {
  const byId = new Map<string, GymRecord>();
  for (const gym of gyms) {
    if (gym?.id && gym?.name) byId.set(gym.id, gym);
  }
  const unique = Array.from(byId.values());

  if (unique.length === 0) return null;

  if (unique.length === 1) {
    const gym = unique[0];
    return {
      title: `New gym: ${gym.alias?.trim() || gym.name}`,
      body: "A new gym has been added to the community map.",
      tag: `new-gym-${gym.id}`,
      renotify: false,
      url: "/gyms",
    };
  }

  const names = unique
    .slice(0, 3)
    .map((gym) => gym.alias?.trim() || gym.name)
    .join(", ");
  const remainder = unique.length - Math.min(unique.length, 3);

  return {
    title: `${unique.length} new gyms added`,
    body: remainder > 0 ? `${names} +${remainder} more` : names,
    tag: `new-gyms-${unique.map((gym) => gym.id).sort().join("-").slice(0, 120)}`,
    renotify: false,
    url: "/gyms",
  };
}

export async function sendNewGymPush(
  gyms: GymRecord[],
  options: { excludeOwnerId?: number | null } = {},
): Promise<NewGymPushResult> {
  const payload = buildNewGymPushPayload(gyms);
  if (!payload) {
    return { owners: 0, sent: 0, failed: 0, removed: 0, suppressed: 0 };
  }

  const subscriptions = await prisma.pushSubscription.findMany({
    select: { ownerId: true },
  });
  const ownerIds = Array.from(
    new Set<number>(
      subscriptions
        .map((subscription: any) => Number(subscription.ownerId))
        .filter((ownerId: number) => Number.isInteger(ownerId))
        .filter((ownerId: number) => ownerId !== options.excludeOwnerId),
    ),
  );

  const results = await Promise.all(
    ownerIds.map((ownerId) =>
      sendPushToUser(ownerId, payload, {
        preferenceKey: PUSH_PREFERENCE_KEYS.NEW_GYMS,
      }),
    ),
  );

  return {
    owners: ownerIds.length,
    sent: results.reduce((total, result) => total + (result.sent || 0), 0),
    failed: results.reduce((total, result) => total + (result.failed || 0), 0),
    removed: results.reduce((total, result) => total + (result.removed || 0), 0),
    suppressed: results.filter((result) => result.suppressed).length,
  };
}
