import type { RaidBossProfileData, RaidBossTickerItem } from "./events";
import { getMegaFallbackProfiles } from "./mega-fallback-source";
import { getCurrentRaidBossProfiles } from "./raid-detail-source";

export async function getResolvedRaidBossProfiles(
  item: RaidBossTickerItem,
): Promise<RaidBossProfileData[]> {
  let profiles: RaidBossProfileData[] = [];

  try {
    profiles = await getCurrentRaidBossProfiles(item);
  } catch (error) {
    console.error(
      `Unable to refresh primary raid details for ${item.boss}`,
      error instanceof Error ? error.message : error,
    );
  }

  if (item.category !== "mega") return profiles;

  profiles = profiles.filter((profile) =>
    String(profile.tier ?? "").toLowerCase().includes("mega"),
  );

  try {
    return [
      ...profiles,
      ...(await getMegaFallbackProfiles(item, profiles)),
    ];
  } catch (error) {
    console.error(
      `Unable to build Mega fallback details for ${item.boss}`,
      error instanceof Error ? error.message : error,
    );
    return profiles;
  }
}
