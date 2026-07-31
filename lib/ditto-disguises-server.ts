import fs from "node:fs/promises";
import path from "node:path";
import {
  isDittoCacheForHash,
  normaliseDittoDisguises,
  type DittoDisguise,
  type DittoDisguisePayload,
} from "./ditto-disguises";
import {
  HASH_CACHE_TTL_MS,
  getPogoApiFileHash,
  type PogoApiFileHash,
} from "./pogoApiHashCache";

const DITTO_API_FILENAME = "possible_ditto_pokemon.json";
const DITTO_FEED_URL =
  "https://pogoapi.net/api/v1/possible_ditto_pokemon.json";
const DITTO_CACHE_VERSION = 2;
const REQUEST_TIMEOUT_MS = 15_000;
const DITTO_CACHE_PATH =
  process.env.DITTO_CACHE_PATH?.trim() ||
  path.join(process.cwd(), "data", "ditto-disguises-cache.json");

interface StoredDittoCache {
  version: number;
  checkedAt: string;
  fetchedAt: string;
  sourceHash: string | null;
  disguises: DittoDisguise[];
  warning: string | null;
}

let memoryCache: StoredDittoCache | null = null;
let refreshInFlight: Promise<StoredDittoCache> | null = null;

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normaliseIsoDate(value: unknown): string | null {
  const source = optionalString(value);
  const timestamp = source ? Date.parse(source) : Number.NaN;

  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function isCacheFresh(
  cache: StoredDittoCache | null,
  now: number = Date.now(),
): boolean {
  if (!cache?.checkedAt) {
    return false;
  }

  const checkedAt = Date.parse(cache.checkedAt);
  return Number.isFinite(checkedAt) && now - checkedAt < HASH_CACHE_TTL_MS;
}

function cachePayload(
  cache: StoredDittoCache,
  isStale: boolean = false,
): DittoDisguisePayload {
  return {
    disguises: cache.disguises,
    season: null,
    fetchedAt: cache.fetchedAt,
    isStale,
    warning: cache.warning,
  };
}

function normaliseStoredCache(value: unknown): StoredDittoCache | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const fetchedAt = normaliseIsoDate(candidate.fetchedAt);
  const checkedAt = normaliseIsoDate(candidate.checkedAt) ?? fetchedAt;
  const disguises = normaliseDittoDisguises(candidate.disguises);

  if (!fetchedAt || !checkedAt || disguises.length === 0) {
    return null;
  }

  return {
    version: DITTO_CACHE_VERSION,
    checkedAt,
    fetchedAt,
    sourceHash: optionalString(candidate.sourceHash),
    disguises,
    warning: optionalString(candidate.warning),
  };
}

async function readDittoCache(): Promise<StoredDittoCache | null> {
  if (memoryCache) {
    return memoryCache;
  }

  try {
    const source = await fs.readFile(DITTO_CACHE_PATH, "utf8");
    memoryCache = normaliseStoredCache(JSON.parse(source));
    return memoryCache;
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
    await fs.writeFile(
      temporaryPath,
      `${JSON.stringify(cache, null, 2)}\n`,
      "utf8",
    );
    await fs.rename(temporaryPath, DITTO_CACHE_PATH);
  } finally {
    await fs.unlink(temporaryPath).catch(() => undefined);
  }
}

async function persistDittoCache(
  cache: StoredDittoCache,
): Promise<StoredDittoCache> {
  memoryCache = cache;

  try {
    await writeDittoCache(cache);
  } catch (error) {
    console.error("Failed to persist Ditto disguise cache", error);
    cache.warning =
      "Ditto disguises are cached in memory, but the cache file could not be written.";
  }

  return cache;
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "LEIGHPOGO ditto-disguise-cache",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(
        `PoGoAPI Ditto feed returned ${response.status} ${response.statusText}`,
      );
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function dataUrl(hashEntry: PogoApiFileHash | null): string {
  return hashEntry?.fullPath
    ? new URL(hashEntry.fullPath, "https://pogoapi.net").toString()
    : DITTO_FEED_URL;
}

async function fetchLatestDisguises(
  hashEntry: PogoApiFileHash | null,
): Promise<StoredDittoCache> {
  const disguises = normaliseDittoDisguises(
    await fetchJson(dataUrl(hashEntry)),
  );

  if (disguises.length === 0) {
    throw new Error("PoGoAPI Ditto feed did not contain any disguises");
  }

  const now = new Date().toISOString();
  const cache: StoredDittoCache = {
    version: DITTO_CACHE_VERSION,
    checkedAt: now,
    fetchedAt: now,
    sourceHash: hashEntry?.hash ?? null,
    disguises,
    warning: hashEntry?.warning ?? null,
  };

  return persistDittoCache(cache);
}

async function refreshDittoCache(
  hashEntry: PogoApiFileHash | null,
): Promise<StoredDittoCache> {
  if (!refreshInFlight) {
    refreshInFlight = fetchLatestDisguises(hashEntry).finally(() => {
      refreshInFlight = null;
    });
  }

  return refreshInFlight;
}

async function markCacheChecked(
  cache: StoredDittoCache,
  hashEntry: PogoApiFileHash,
): Promise<StoredDittoCache> {
  return persistDittoCache({
    ...cache,
    version: DITTO_CACHE_VERSION,
    checkedAt: new Date().toISOString(),
    sourceHash: hashEntry.hash,
    warning: hashEntry.warning,
  });
}

function staleFallback(
  cache: StoredDittoCache,
  error: unknown,
): DittoDisguisePayload {
  return {
    ...cachePayload(cache, true),
    warning:
      error instanceof Error
        ? `The Ditto disguise refresh failed: ${error.message}`
        : "The Ditto disguise refresh failed.",
  };
}

export async function getDittoDisguiseData(): Promise<DittoDisguisePayload> {
  const cache = await readDittoCache();

  if (cache && isCacheFresh(cache)) {
    return cachePayload(cache);
  }

  let hashEntry: PogoApiFileHash | null = null;

  try {
    hashEntry = await getPogoApiFileHash(DITTO_API_FILENAME);
  } catch (error) {
    if (cache) {
      return staleFallback(cache, error);
    }

    console.warn(
      "Unable to check the PoGoAPI hash manifest; downloading the initial Ditto list directly",
      error,
    );
  }

  if (
    cache &&
    hashEntry &&
    isDittoCacheForHash(cache.sourceHash, hashEntry.hash)
  ) {
    return cachePayload(await markCacheChecked(cache, hashEntry));
  }

  try {
    return cachePayload(await refreshDittoCache(hashEntry));
  } catch (error) {
    if (cache) {
      return staleFallback(cache, error);
    }

    throw error;
  }
}
