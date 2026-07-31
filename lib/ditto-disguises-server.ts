import fs from "node:fs/promises";
import path from "node:path";
import {
  isDittoCacheForSeason,
  normaliseDittoDisguises,
  type DittoDisguisePayload,
  type DittoSeason,
} from "./ditto-disguises";
import {
  getCurrentPokemonGoSeason,
  type PokemonGoSeasonBoundary,
} from "./season-server";

const DITTO_FEED_URL =
  "https://pogoapi.net/api/v1/possible_ditto_pokemon.json";
const DITTO_CACHE_VERSION = 1;
const DITTO_CACHE_PATH =
  process.env.DITTO_CACHE_PATH?.trim() ||
  path.join(process.cwd(), "data", "ditto-disguises-cache.json");

interface StoredDittoCache extends DittoDisguisePayload {
  version: number;
  season: DittoSeason;
}

let refreshInFlight: Promise<StoredDittoCache> | null = null;

function requiredString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normaliseSeason(value: unknown): DittoSeason | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const eventID = requiredString(candidate.eventID);
  const name = requiredString(candidate.name);
  const start = requiredString(candidate.start);
  const end = requiredString(candidate.end);

  return eventID && name && start && end
    ? { eventID, name, start, end }
    : null;
}

async function readDittoCache(): Promise<StoredDittoCache | null> {
  try {
    const source = await fs.readFile(DITTO_CACHE_PATH, "utf8");
    const parsed: unknown = JSON.parse(source);

    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const candidate = parsed as Record<string, unknown>;
    const fetchedAt = requiredString(candidate.fetchedAt);
    const season = normaliseSeason(candidate.season);
    const disguises = normaliseDittoDisguises(candidate.disguises);

    if (
      candidate.version !== DITTO_CACHE_VERSION ||
      !fetchedAt ||
      !season ||
      disguises.length === 0
    ) {
      return null;
    }

    return {
      version: DITTO_CACHE_VERSION,
      fetchedAt,
      season,
      disguises,
      isStale: false,
      warning: null,
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;

    if (code === "ENOENT" || error instanceof SyntaxError) {
      return null;
    }

    throw error;
  }
}

async function writeDittoCache(cache: StoredDittoCache): Promise<void> {
  const directory = path.dirname(DITTO_CACHE_PATH);
  const temporaryPath = `${DITTO_CACHE_PATH}.${process.pid}.${Date.now()}.tmp`;

  await fs.mkdir(directory, { recursive: true });

  try {
    await fs.writeFile(temporaryPath, `${JSON.stringify(cache)}\n`, "utf8");
    await fs.rename(temporaryPath, DITTO_CACHE_PATH);
  } finally {
    await fs.unlink(temporaryPath).catch(() => undefined);
  }
}

async function fetchLatestDisguises(
  season: PokemonGoSeasonBoundary,
): Promise<StoredDittoCache> {
  const response = await fetch(DITTO_FEED_URL, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(
      `PoGoAPI Ditto feed returned ${response.status} ${response.statusText}`,
    );
  }

  const disguises = normaliseDittoDisguises(await response.json());

  if (disguises.length === 0) {
    throw new Error("PoGoAPI Ditto feed did not contain any disguises");
  }

  const cache: StoredDittoCache = {
    version: DITTO_CACHE_VERSION,
    fetchedAt: new Date().toISOString(),
    season,
    disguises,
    isStale: false,
    warning: null,
  };

  await writeDittoCache(cache);

  return cache;
}

async function refreshDittoCache(
  season: PokemonGoSeasonBoundary,
): Promise<StoredDittoCache> {
  if (!refreshInFlight) {
    refreshInFlight = fetchLatestDisguises(season).finally(() => {
      refreshInFlight = null;
    });
  }

  return refreshInFlight;
}

function staleFallback(
  cache: StoredDittoCache,
  error: unknown,
): DittoDisguisePayload {
  return {
    disguises: cache.disguises,
    season: cache.season,
    fetchedAt: cache.fetchedAt,
    isStale: true,
    warning:
      error instanceof Error
        ? `The Ditto disguise refresh failed: ${error.message}`
        : "The Ditto disguise refresh failed.",
  };
}

export async function getDittoDisguiseData(): Promise<DittoDisguisePayload> {
  const cache = await readDittoCache();
  let season: PokemonGoSeasonBoundary | null;

  try {
    season = await getCurrentPokemonGoSeason();
  } catch (error) {
    if (cache) {
      return staleFallback(cache, error);
    }

    throw error;
  }

  if (!season) {
    const error = new Error("ScrapedDuck did not provide an active season");

    if (cache) {
      return staleFallback(cache, error);
    }

    throw error;
  }

  if (cache && isDittoCacheForSeason(cache.season.eventID, season.eventID)) {
    return {
      disguises: cache.disguises,
      season: cache.season,
      fetchedAt: cache.fetchedAt,
      isStale: false,
      warning: null,
    };
  }

  try {
    return await refreshDittoCache(season);
  } catch (error) {
    if (cache) {
      return staleFallback(cache, error);
    }

    throw error;
  }
}
