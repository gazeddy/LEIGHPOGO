import fs from "node:fs/promises";
import path from "node:path";
import type {
  EventsPageData,
  PokemonGoEventPokemon,
  PokemonGoEventSummary,
  PokemonGoRaidScheduleBoss,
  PokemonGoRaidScheduleEntry,
} from "./events";
import {
  fetchEventDetailsBySourceLink,
  findEventDetails,
  type EventDetailsEnrichment,
} from "./event-details-server";
import { applyEventOverrides } from "./event-overrides";
import { localEventToSummary, readLocalEvents } from "./local-events";

const EVENTS_FEED_URL =
  "https://raw.githubusercontent.com/Drumstix42/ScrapedDuck/refs/heads/data/events.min.json";
const EVENTS_CACHE_VERSION = 4;
const EVENTS_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const EVENTS_CACHE_PATH =
  process.env.EVENTS_CACHE_PATH?.trim() ||
  path.join(process.cwd(), "data", "events-cache.json");

interface StoredEventsCache {
  version: number;
  fetchedAt: string;
  events: PokemonGoEventSummary[];
}

export interface ImportedEventsAdminData {
  events: PokemonGoEventSummary[];
  fetchedAt: string;
  isStale: boolean;
  warning: string | null;
}

let refreshInFlight: Promise<StoredEventsCache> | null = null;

function asRequiredString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asTags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter((tag): tag is string => typeof tag === "string")
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

function normaliseEventPokemon(value: unknown): PokemonGoEventPokemon | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const pokemon = value as Record<string, unknown>;
  const name = asRequiredString(pokemon.name);
  if (!name) return null;

  const shinyValue = pokemon.canBeShiny ?? pokemon.shiny_available;

  return {
    name,
    image: asOptionalString(pokemon.image) ?? asOptionalString(pokemon.asset_url),
    canBeShiny: typeof shinyValue === "boolean" ? shinyValue : null,
  };
}

function asEventPokemon(value: unknown): PokemonGoEventPokemon[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const result: PokemonGoEventPokemon[] = [];

  for (const rawPokemon of value) {
    const pokemon = normaliseEventPokemon(rawPokemon);
    if (!pokemon) continue;

    const key = pokemon.name.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(pokemon);
  }

  return result;
}

function bonusText(value: unknown): string | null {
  if (typeof value === "string") {
    return value.trim() || null;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const bonus = value as Record<string, unknown>;
  return (
    asOptionalString(bonus.text) ??
    asOptionalString(bonus.bonus) ??
    asOptionalString(bonus.description) ??
    asOptionalString(bonus.label)
  );
}

function asBonuses(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(value.map(bonusText).filter((bonus): bonus is string => bonus !== null)),
  );
}

function normaliseRaidScheduleBoss(
  value: unknown,
): PokemonGoRaidScheduleBoss | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const boss = value as Record<string, unknown>;
  const name = asRequiredString(boss.name);

  if (!name) {
    return null;
  }

  return {
    name,
    image: asOptionalString(boss.image),
    canBeShiny:
      typeof boss.canBeShiny === "boolean" ? boss.canBeShiny : null,
    raidType: asOptionalString(boss.raidType),
  };
}

function asRaidBosses(value: unknown): PokemonGoRaidScheduleBoss[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(normaliseRaidScheduleBoss)
    .filter((boss): boss is PokemonGoRaidScheduleBoss => boss !== null);
}

function asRaidSchedule(value: unknown): PokemonGoRaidScheduleEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((rawEntry): PokemonGoRaidScheduleEntry | null => {
      if (!rawEntry || typeof rawEntry !== "object" || Array.isArray(rawEntry)) {
        return null;
      }

      const entry = rawEntry as Record<string, unknown>;
      const date = asRequiredString(entry.date);
      const bosses = asRaidBosses(entry.bosses);

      if (!date || bosses.length === 0) {
        return null;
      }

      return {
        date,
        time: asOptionalString(entry.time),
        label: asOptionalString(entry.label),
        bosses,
      };
    })
    .filter((entry): entry is PokemonGoRaidScheduleEntry => entry !== null);
}

function raidBossKey(boss: PokemonGoRaidScheduleBoss): string {
  return boss.name.trim().toLowerCase().replace(/\s+/g, " ");
}

function raidScheduleWithEventWideBosses(
  scheduleValue: unknown,
  raidBattlesValue: unknown,
): PokemonGoRaidScheduleEntry[] {
  const schedule = asRaidSchedule(scheduleValue);
  if (schedule.length === 0) return schedule;

  const raidBattles =
    raidBattlesValue &&
    typeof raidBattlesValue === "object" &&
    !Array.isArray(raidBattlesValue)
      ? (raidBattlesValue as Record<string, unknown>)
      : null;
  const aggregateBosses = asRaidBosses(raidBattles?.bosses);
  if (aggregateBosses.length === 0) return schedule;

  const scheduledBosses = new Set(
    schedule.flatMap((entry) => entry.bosses.map(raidBossKey)),
  );
  const eventWideExtras = aggregateBosses.filter(
    (boss) => !scheduledBosses.has(raidBossKey(boss)),
  );
  if (eventWideExtras.length === 0) return schedule;

  return schedule.map((entry) => {
    const existing = new Set(entry.bosses.map(raidBossKey));
    return {
      ...entry,
      bosses: [
        ...entry.bosses,
        ...eventWideExtras.filter((boss) => !existing.has(raidBossKey(boss))),
      ],
    };
  });
}

function normaliseEvent(value: unknown): PokemonGoEventSummary | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const event = value as Record<string, unknown>;
  const eventID = asRequiredString(event.eventID);
  const name = asRequiredString(event.name);
  const eventType = asRequiredString(event.eventType);
  const start = asRequiredString(event.start);
  const end = asRequiredString(event.end);

  if (!eventID || !name || !eventType || !start || !end) {
    return null;
  }

  const extraData =
    event.extraData &&
    typeof event.extraData === "object" &&
    !Array.isArray(event.extraData)
      ? (event.extraData as Record<string, unknown>)
      : null;

  return {
    eventID,
    name,
    eventType,
    heading: asOptionalString(event.heading) ?? eventType,
    link: asOptionalString(event.link),
    image: asOptionalString(event.image),
    start,
    end,
    tags: asTags(event.tags),
    description: asOptionalString(event.description),
    campfireUrl: asOptionalString(event.campfireUrl),
    wildSpawns: asEventPokemon(event.wildSpawns),
    featuredRaids: asEventPokemon(event.featuredRaids),
    bonuses: asBonuses(event.bonuses ?? extraData?.bonuses),
    raidSchedule: raidScheduleWithEventWideBosses(
      extraData?.raidSchedule ?? event.raidSchedule,
      extraData?.raidbattles,
    ),
    source: event.source === "local" ? "local" : "feed",
  };
}

function applyDetailsEnrichment(
  event: PokemonGoEventSummary,
  detailsBySourceLink: Map<string, EventDetailsEnrichment>,
): PokemonGoEventSummary {
  const details = findEventDetails(detailsBySourceLink, event.link);
  if (!details) return event;

  return {
    ...event,
    description: event.description ?? details.description,
    wildSpawns:
      details.wildSpawns.length > 0 ? details.wildSpawns : event.wildSpawns,
    featuredRaids:
      details.featuredRaids.length > 0
        ? details.featuredRaids
        : event.featuredRaids,
    bonuses: details.bonuses.length > 0 ? details.bonuses : event.bonuses,
  };
}

function getLondonDateKey(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return `${values.year}-${values.month}-${values.day}`;
}

function isCacheStale(cache: StoredEventsCache, now: Date = new Date()): boolean {
  const fetchedAt = Date.parse(cache.fetchedAt);

  return (
    !Number.isFinite(fetchedAt) ||
    now.getTime() - fetchedAt >= EVENTS_CACHE_MAX_AGE_MS
  );
}

function selectUpcomingEvents(
  events: PokemonGoEventSummary[],
  limit: number,
): PokemonGoEventSummary[] {
  const today = getLondonDateKey();

  return events
    .filter((event) => event.end.slice(0, 10) >= today)
    .sort((left, right) => {
      const startDifference = left.start.localeCompare(right.start);

      return startDifference !== 0
        ? startDifference
        : left.name.localeCompare(right.name);
    })
    .slice(0, Math.max(1, limit));
}

async function selectWithLocalEvents(
  feedEvents: PokemonGoEventSummary[],
  limit: number,
): Promise<PokemonGoEventSummary[]> {
  const localEvents = await readLocalEvents();
  const normalisedFeedEvents = feedEvents.map((event) => ({
    ...event,
    tags: event.tags ?? [],
    source: event.source ?? ("feed" as const),
  }));
  const overriddenFeedEvents = await applyEventOverrides(normalisedFeedEvents);

  return selectUpcomingEvents(
    [...overriddenFeedEvents, ...localEvents.map(localEventToSummary)],
    limit,
  );
}

async function readEventsCache(): Promise<StoredEventsCache | null> {
  try {
    const source = await fs.readFile(EVENTS_CACHE_PATH, "utf8");
    const parsed: unknown = JSON.parse(source);

    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const candidate = parsed as Record<string, unknown>;
    const fetchedAt = asRequiredString(candidate.fetchedAt);

    if (
      candidate.version !== EVENTS_CACHE_VERSION ||
      !fetchedAt ||
      !Array.isArray(candidate.events)
    ) {
      return null;
    }

    return {
      version: EVENTS_CACHE_VERSION,
      fetchedAt,
      events: candidate.events
        .map(normaliseEvent)
        .filter((event): event is PokemonGoEventSummary => event !== null),
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;

    if (code === "ENOENT" || error instanceof SyntaxError) {
      return null;
    }

    throw error;
  }
}

async function writeEventsCache(cache: StoredEventsCache): Promise<void> {
  const directory = path.dirname(EVENTS_CACHE_PATH);
  const temporaryPath = `${EVENTS_CACHE_PATH}.${process.pid}.${Date.now()}.tmp`;

  await fs.mkdir(directory, { recursive: true });

  try {
    await fs.writeFile(temporaryPath, `${JSON.stringify(cache)}\n`, "utf8");
    await fs.rename(temporaryPath, EVENTS_CACHE_PATH);
  } finally {
    await fs.unlink(temporaryPath).catch(() => undefined);
  }
}

async function fetchLatestEvents(): Promise<StoredEventsCache> {
  const [response, detailsBySourceLink] = await Promise.all([
    fetch(EVENTS_FEED_URL, {
      headers: {
        Accept: "application/json",
      },
    }),
    fetchEventDetailsBySourceLink(),
  ]);

  if (!response.ok) {
    throw new Error(
      `Events feed returned ${response.status} ${response.statusText}`,
    );
  }

  const payload: unknown = await response.json();

  if (!Array.isArray(payload)) {
    throw new Error("Events feed did not return a JSON array");
  }

  const cache: StoredEventsCache = {
    version: EVENTS_CACHE_VERSION,
    fetchedAt: new Date().toISOString(),
    events: payload
      .map(normaliseEvent)
      .filter((event): event is PokemonGoEventSummary => event !== null)
      .map((event) => applyDetailsEnrichment(event, detailsBySourceLink)),
  };

  await writeEventsCache(cache);

  return cache;
}

async function refreshCache(): Promise<StoredEventsCache> {
  if (!refreshInFlight) {
    refreshInFlight = fetchLatestEvents().finally(() => {
      refreshInFlight = null;
    });
  }

  return refreshInFlight;
}

async function loadUsableCache(): Promise<{
  cache: StoredEventsCache;
  warning: string | null;
}> {
  let cache = await readEventsCache();
  let warning: string | null = null;

  if (!cache || isCacheStale(cache)) {
    try {
      cache = await refreshCache();
    } catch (error) {
      if (!cache) {
        throw error;
      }

      warning =
        error instanceof Error
          ? `The daily refresh failed: ${error.message}`
          : "The daily refresh failed.";
    }
  }

  return { cache, warning };
}

export async function getEventsPageData(
  limit: number = 80,
): Promise<EventsPageData> {
  const { cache, warning } = await loadUsableCache();

  return {
    events: await selectWithLocalEvents(cache.events, limit),
    fetchedAt: cache.fetchedAt,
    isStale: isCacheStale(cache),
    warning,
  };
}

export async function getImportedEventsForAdmin(
  limit: number = 200,
): Promise<ImportedEventsAdminData> {
  const { cache, warning } = await loadUsableCache();

  return {
    events: selectUpcomingEvents(cache.events, limit),
    fetchedAt: cache.fetchedAt,
    isStale: isCacheStale(cache),
    warning,
  };
}

export async function forceRefreshEventsCache(
  limit: number = 80,
): Promise<EventsPageData> {
  const cache = await refreshCache();

  return {
    events: await selectWithLocalEvents(cache.events, limit),
    fetchedAt: cache.fetchedAt,
    isStale: false,
    warning: null,
  };
}
