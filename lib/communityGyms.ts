import type { GymRecord } from "./gyms";

export const COMMUNITY_GYM_ID_PREFIX = "community-";

export function isCommunityGym(gym: Pick<GymRecord, "id">): boolean {
  return gym.id.startsWith(COMMUNITY_GYM_ID_PREFIX);
}

export function cleanCommunityGymTitle(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Enter a title for the gym.");
  }

  const title = value.trim().replace(/\s+/g, " ");

  if (!title) {
    throw new Error("Enter a title for the gym.");
  }

  if (title.length > 120) {
    throw new Error("Gym titles must be 120 characters or fewer.");
  }

  return title;
}
