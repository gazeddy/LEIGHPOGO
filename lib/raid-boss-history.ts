import prisma from "./prisma";
import {
  raidCategoryLabel,
  selectCurrentRaidBosses,
  selectNextRaidBosses,
  selectRaidBossEvents,
} from "./event-selection";
import {
  getEventsPageData,
  getImportedEventsForAdmin,
} from "./events-server";
import {
  getMegaFallbackProfiles,
  isProvisionalMegaProfileKey,
} from "./mega-fallback-source";
import {
  getCurrentRaidBossProfiles,
} from "./raid-detail-source";
import type {
  PokemonGoEventSummary,
  RaidBossProfileData,
  RaidBossTickerItem,
  RaidCategory,
  RaidCategoryData,
  RaidRotationData,
  RaidToolsData,
  RaidTypeMatchup,
} from "./events";

const CATEGORIES: RaidCategory[] = ["five-star", "shadow", "mega"];
const PROFILE_REFRESH_INTERVAL_MS = 60 * 60 * 1000;
const PROVISIONAL_PROFILE_REFRESH_INTERVAL_MS = 15 * 60 * 1000;
const PREVIOUS_ROTATION_VISIBILITY_MS = 24 * 60 * 60 * 1000;

function parseJsonArray<T>(value: string | null | undefined): T[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function anchorPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "raid";
}

export function raidRotationAnchor(category: RaidCategory, eventID: string): string {
  return `raid-${category}-${anchorPart(eventID)}`;
}

function categoryAnchor(category: RaidCategory): string {
  return `raid-${category}`;
}

function hasExplicitTimeZone(value: string): boolean {
  return /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
}

function londonOffsetMs(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  const londonAsUtc = Date.UTC(
    values.year,
    values.month - 1,
    values.day,
    values.hour,
    values.minute,
    values.second,
    date.getUTCMilliseconds(),
  );
  return londonAsUtc - date.getTime();
}

export function raidStorageDate(value: string): Date {
  if (hasExplicitTimeZone(value)) {
    return new Date(value);
  }

  const wallClockMs = Date.parse(`${value}Z`);
  if (!Number.isFinite(wallClockMs)) {
    return new Date(Number.NaN);
  }

  let instant = new Date(wallClockMs);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    instant = new Date(wallClockMs - londonOffsetMs(instant));
  }
  return instant;
}

function eventById(events: PokemonGoEventSummary[]): Map<string, PokemonGoEventSummary> {
  return new Map(events.map((event) => [event.eventID, event]));
}

function mergeRaidSourceEvents(
  importedEvents: PokemonGoEventSummary[],
  pageEvents: PokemonGoEventSummary[],
): PokemonGoEventSummary[] {
  const merged = new Map<string, PokemonGoEventSummary>();

  for (const event of importedEvents) {
    merged.set(event.eventID, event);
  }

  for (const event of pageEvents) {
    if (event.source === "local" || !merged.has(event.eventID)) {
      merged.set(event.eventID, event);
    }
  }

  return Array.from(merged.values());
}

async function syncRaidRotations(events: PokemonGoEventSummary[]): Promise<void> {
  const sourceEvents = eventById(events);
  const rotations = selectRaidBossEvents(events);

  if (rotations.length === 0) return;

  const existingRows = await prisma.raidRotation.findMany({
    where: { eventId: { in: rotations.map((item) => item.eventID) } },
  });
  const existingById = new Map(
    existingRows.map((row: any) => [row.eventId, row]),
  );

  for (const item of rotations) {
    const source = sourceEvents.get(item.eventID);
    const existing = existingById.get(item.eventID) as any;
    const data = {
      category: item.category,
      boss: item.boss,
      start: raidStorageDate(item.start),
      end: raidStorageDate(item.end),
      startRaw: item.start,
      endRaw: item.end,
      sourceUrl: item.link,
      imageUrl: source?.image ?? null,
    };

    if (!existing) {
      await prisma.raidRotation.create({
        data: { eventId: item.eventID, ...data },
      });
      continue;
    }

    const unchanged =
      existing.category === data.category &&
      existing.boss === data.boss &&
      existing.startRaw === data.startRaw &&
      existing.endRaw === data.endRaw &&
      new Date(existing.start).getTime() === data.start.getTime() &&
      new Date(existing.end).getTime() === data.end.getTime() &&
      (existing.sourceUrl ?? null) === data.sourceUrl &&
      (existing.imageUrl ?? null) === data.imageUrl;

    if (!unchanged) {
      await prisma.raidRotation.update({
        where: { eventId: item.eventID },
        data,
      });
    }
  }
}

async function saveProfile(profile: RaidBossProfileData): Promise<void> {
  await prisma.raidBossProfile.upsert({
    where: { key: profile.key },
    update: {
      category: profile.category,
      name: profile.name,
      pokemonId: profile.pokemonId,
      form: profile.form,
      tier: profile.tier,
      types: JSON.stringify(profile.types),
      weaknesses: JSON.stringify(profile.weaknesses),
      resistances: JSON.stringify(profile.resistances),
      boostedWeather: JSON.stringify(profile.boostedWeather),
      maxUnboostedCp: profile.maxUnboostedCp,
      maxBoostedCp: profile.maxBoostedCp,
      possibleShiny: profile.possibleShiny,
      refreshedAt: profile.refreshedAt ? new Date(profile.refreshedAt) : null,
    },
    create: {
      key: profile.key,
      category: profile.category,
      name: profile.name,
      pokemonId: profile.pokemonId,
      form: profile.form,
      tier: profile.tier,
      types: JSON.stringify(profile.types),
      weaknesses: JSON.stringify(profile.weaknesses),
      resistances: JSON.stringify(profile.resistances),
      boostedWeather: JSON.stringify(profile.boostedWeather),
      maxUnboostedCp: profile.maxUnboostedCp,
      maxBoostedCp: profile.maxBoostedCp,
      possibleShiny: profile.possibleShiny,
      refreshedAt: profile.refreshedAt ? new Date(profile.refreshedAt) : null,
    },
  });
}

function normaliseLooseName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[’']/g, "")
    .replace(/\b(?:forme?|mega|shadow)\b/gi, " ")
    .replace(/[^a-z0-9♀♂]+/gi, " ")
    .trim()
    .toLowerCase();
}

function rotationBossParts(value: string): string[] {
  return value
    .replace(/\s+(?:and|&)\s+/gi, ",")
    .replace(/\s*\/\s*/g, ",")
    .split(",")
    .map(normaliseLooseName)
    .filter(Boolean);
}

function profileMatchesPart(name: string, part: string): boolean {
  const normalised = normaliseLooseName(name);
  return normalised === part || normalised.includes(part) || part.includes(normalised);
}

async function findReusableProfileKeys(item: RaidBossTickerItem): Promise<string[]> {
  const parts = rotationBossParts(item.boss);
  if (parts.length === 0) return [];
  const profiles = await prisma.raidBossProfile.findMany({
    where: { category: item.category },
    select: { key: true, name: true },
  });
  return Array.from(new Set(
    parts.flatMap((part) => profiles
      .filter((profile: { key: string; name: string }) => profileMatchesPart(profile.name, part))
      .map((profile: { key: string; name: string }) => profile.key)),
  ));
}

async function profilesAreFresh(
  keys: string[],
  item: RaidBossTickerItem,
  now: Date,
): Promise<boolean> {
  if (keys.length === 0) return false;

  const profiles = await prisma.raidBossProfile.findMany({
    where: { key: { in: keys } },
    select: { key: true, name: true, refreshedAt: true },
  });

  if (profiles.length !== keys.length) return false;

  const parts = rotationBossParts(item.boss);
  if (!parts.every((part) => profiles.some((profile: { name: string }) => profileMatchesPart(profile.name, part)))) {
    return false;
  }

  return profiles.every((profile: { key: string; refreshedAt: Date | null }) => {
    if (!profile.refreshedAt) return false;
    const refreshedAt = new Date(profile.refreshedAt).getTime();
    const maxAge = isProvisionalMegaProfileKey(profile.key)
      ? PROVISIONAL_PROFILE_REFRESH_INTERVAL_MS
      : PROFILE_REFRESH_INTERVAL_MS;
    return Number.isFinite(refreshedAt) && now.getTime() - refreshedAt < maxAge;
  });
}

async function enrichActiveRotation(
  item: RaidBossTickerItem,
  now: Date = new Date(),
): Promise<void> {
  const rotation = await prisma.raidRotation.findUnique({
    where: { eventId: item.eventID },
    select: { bossKeys: true },
  });

  if (!rotation) return;

  const existingKeys = parseJsonArray<string>(rotation.bossKeys);
  if (await profilesAreFresh(existingKeys, item, now)) return;

  let profiles: RaidBossProfileData[] = [];
  try {
    profiles = await getCurrentRaidBossProfiles(item);
  } catch (error) {
    console.error(`Unable to refresh primary raid details for ${item.boss}`, error);
  }

  if (item.category === "mega") {
    try {
      profiles = [
        ...profiles,
        ...(await getMegaFallbackProfiles(item, profiles)),
      ];
    } catch (error) {
      console.error(`Unable to build Mega fallback details for ${item.boss}`, error);
    }
  }

  for (const profile of profiles) {
    await saveProfile(profile);
  }

  let keys = profiles.map((profile) => profile.key);
  if (keys.length === 0) {
    keys = await findReusableProfileKeys(item);
  }

  if (keys.length > 0) {
    const bossKeys = JSON.stringify(Array.from(new Set(keys)));
    if (rotation.bossKeys !== bossKeys) {
      await prisma.raidRotation.update({
        where: { eventId: item.eventID },
        data: { bossKeys },
      });
    }
  }
}

function profileFromRow(row: any): RaidBossProfileData {
  return {
    key: row.key,
    category: row.category as RaidCategory,
    name: row.name,
    pokemonId: row.pokemonId ?? null,
    form: row.form ?? null,
    tier: row.tier ?? null,
    types: parseJsonArray<string>(row.types),
    weaknesses: parseJsonArray<RaidTypeMatchup>(row.weaknesses),
    resistances: parseJsonArray<RaidTypeMatchup>(row.resistances),
    boostedWeather: parseJsonArray<string>(row.boostedWeather),
    maxUnboostedCp: row.maxUnboostedCp ?? null,
    maxBoostedCp: row.maxBoostedCp ?? null,
    possibleShiny: row.possibleShiny ?? null,
    refreshedAt: row.refreshedAt ? new Date(row.refreshedAt).toISOString() : null,
  };
}

async function profilesForRotation(row: any): Promise<RaidBossProfileData[]> {
  let keys = parseJsonArray<string>(row.bossKeys);
  if (keys.length === 0) {
    const fallbackItem: RaidBossTickerItem = {
      eventID: row.eventId,
      category: row.category,
      label: raidCategoryLabel(row.category),
      boss: row.boss,
      start: row.startRaw,
      end: row.endRaw,
      link: row.sourceUrl,
    };
    keys = await findReusableProfileKeys(fallbackItem);
  }
  if (keys.length === 0) return [];
  const rows = await prisma.raidBossProfile.findMany({ where: { key: { in: keys } } });
  const byKey = new Map(rows.map((profile: any) => [profile.key, profile]));
  return keys
    .map((key) => byKey.get(key))
    .filter(Boolean)
    .map(profileFromRow);
}

async function categoryHistory(category: RaidCategory, now: Date): Promise<RaidRotationData[]> {
  const previousCutoff = new Date(now.getTime() - PREVIOUS_ROTATION_VISIBILITY_MS);
  const rows = await prisma.raidRotation.findMany({
    where: {
      category,
      start: { lte: now },
      end: { gt: previousCutoff },
    },
    orderBy: { start: "desc" },
  });

  const activeRows = rows.filter(
    (row: any) => new Date(row.start) <= now && new Date(row.end) > now,
  );
  const previousRow = rows.find((row: any) => new Date(row.end) <= now);
  const visibleRows = previousRow ? [...activeRows, previousRow] : activeRows;

  return Promise.all(visibleRows.map(async (row: any) => ({
    eventID: row.eventId,
    category,
    label: raidCategoryLabel(category),
    boss: row.boss,
    start: row.startRaw,
    end: row.endRaw,
    active: new Date(row.start) <= now && new Date(row.end) > now,
    sourceUrl: row.sourceUrl ?? null,
    imageUrl: row.imageUrl ?? null,
    anchor: raidRotationAnchor(category, row.eventId),
    bosses: await profilesForRotation(row),
  })));
}

function currentTickerLink(item: RaidBossTickerItem): string {
  return `/tools/raids#${raidRotationAnchor(item.category, item.eventID)}`;
}

function nextTickerLink(item: RaidBossTickerItem): string {
  return `/tools/raids#${categoryAnchor(item.category)}`;
}

function profileCatchCp(profiles: RaidBossProfileData[]) {
  return profiles
    .filter((profile) => profile.maxUnboostedCp && profile.maxBoostedCp)
    .map((profile) => ({
      boss: profile.name,
      maxUnboostedCp: profile.maxUnboostedCp as number,
      maxBoostedCp: profile.maxBoostedCp as number,
      possibleShiny: profile.possibleShiny === true,
    }));
}

async function currentTickerItems(items: RaidBossTickerItem[]): Promise<RaidBossTickerItem[]> {
  return Promise.all(items.map(async (item) => {
    const row = await prisma.raidRotation.findUnique({ where: { eventId: item.eventID } });
    const profiles = row ? await profilesForRotation(row) : [];
    const catchCp = profileCatchCp(profiles);
    return {
      ...item,
      state: "current" as const,
      link: currentTickerLink(item),
      ...(catchCp.length > 0 ? { catchCp } : {}),
    };
  }));
}

export async function getRaidToolsData(now: Date = new Date()): Promise<RaidToolsData> {
  const [eventData, importedData] = await Promise.all([
    getEventsPageData(500),
    getImportedEventsForAdmin(500),
  ]);
  const raidSourceEvents = mergeRaidSourceEvents(importedData.events, eventData.events);

  await syncRaidRotations(raidSourceEvents);

  const current = selectCurrentRaidBosses(raidSourceEvents, now);
  await Promise.all(current.map((item) => enrichActiveRotation(item, now)));

  const next = selectNextRaidBosses(raidSourceEvents, now).map((item) => ({
    ...item,
    state: "next" as const,
    link: nextTickerLink(item),
    catchCp: undefined,
  }));

  const histories = await Promise.all(CATEGORIES.map((category) => categoryHistory(category, now)));
  const categories: RaidCategoryData[] = CATEGORIES.map((category, index) => ({
    category,
    label: raidCategoryLabel(category),
    rotations: histories[index],
    next: next.find((item) => item.category === category) ?? null,
  }));

  return {
    categories,
    tickerItems: [
      ...(await currentTickerItems(current)),
      ...next,
    ],
    fetchedAt: importedData.fetchedAt,
    warning: importedData.warning ?? eventData.warning,
  };
}
