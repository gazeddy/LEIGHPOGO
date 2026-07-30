import fs from "node:fs/promises";
import path from "node:path";
import type {
  EventsPageData,
  PokemonGoEventSummary,
} from "./events";
import { applyEventOverrides } from "./event-overrides";
import { localEventToSummary, readLocalEvents } from "./local-events";

const EVENTS_FEED_URL =
  "https://raw.githubusercontent.com/Drumstix42/ScrapedDuck/refs/heads/data/events.min.json";
const EVENTS_CACHE_VERSION = 1;
const EVENTS_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
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
    source: event.source === "local" ? "local" : "feed",
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
  const response = await fetch(EVENTS_FEED_URL, {
    headers: {
      Accept: "application/json",
    },
  });

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
      .filter((event): event is PokemonGoEventSummary => event !== null),
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
          ? `The weekly refresh failed: ${error.message}`
          : "The weekly refresh failed.";
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
