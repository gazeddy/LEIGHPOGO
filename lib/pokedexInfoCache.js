const fs = require("fs/promises");
const path = require("path");
const {
  HASH_CACHE_TTL_MS,
  getPogoApiFileHash,
} = require("./pogoApiHashCache");
const { buildPokedexInfo } = require("./pokedexInfo");

const CACHE_VERSION = 1;
const CACHE_TTL_MS = HASH_CACHE_TTL_MS;
const REQUEST_TIMEOUT_MS = 15_000;
const MIN_EXPECTED_POKEMON = 100;
const FILES = [
  "pokemon_types.json",
  "type_effectiveness.json",
  "pokemon_evolutions.json",
];

let refreshPromise = null;
let memoryCache = null;

const runtimeCachePath = () =>
  process.env.POGOAPI_POKEDEX_INFO_CACHE_PATH ||
  path.join(process.cwd(), "data", ".cache", "pokedex-info.json");

function validateCache(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (value.version !== CACHE_VERSION) return null;
  if (!value.checkedAt || !Number.isFinite(Date.parse(value.checkedAt))) return null;
  if (!value.sourceHashes || typeof value.sourceHashes !== "object") return null;
  if (!value.data || typeof value.data !== "object") return null;
  if (!value.data.pokemon || typeof value.data.pokemon !== "object") return null;
  if (Object.keys(value.data.pokemon).length < MIN_EXPECTED_POKEMON) return null;
  if (!Array.isArray(value.data.types) || value.data.types.length < 10) return null;

  return {
    version: CACHE_VERSION,
    checkedAt: new Date(value.checkedAt).toISOString(),
    sourceHashes: value.sourceHashes,
    data: value.data,
  };
}

function isCacheFresh(cache, maxAgeMs = CACHE_TTL_MS, now = Date.now()) {
  if (!cache?.checkedAt) return false;
  const checkedAt = Date.parse(cache.checkedAt);
  return Number.isFinite(checkedAt) && now - checkedAt < maxAgeMs;
}

async function readCache(filePath) {
  if (memoryCache?.filePath === filePath) return memoryCache.value;

  try {
    const parsed = JSON.parse(await fs.readFile(filePath, "utf8"));
    const cache = validateCache(parsed);
    if (cache) memoryCache = { filePath, value: cache };
    return cache;
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) return null;
    throw error;
  }
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "LEIGHPOGO pokedex-info-cache",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`PoGoAPI request failed with status ${response.status}.`);
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function writeCache(filePath, cache, strictWrite) {
  const directory = path.dirname(filePath);
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;

  try {
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(temporaryPath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
    await fs.rename(temporaryPath, filePath);
    memoryCache = { filePath, value: cache };
  } catch (error) {
    try {
      await fs.unlink(temporaryPath);
    } catch {}

    if (strictWrite) throw error;
    console.error("Unable to persist the Pokédex information cache", error);
  }
}

function hashesMatch(left, right) {
  return FILES.every((filename) => left?.[filename] && left[filename] === right?.[filename]);
}

async function resolveSources(existingCache) {
  try {
    const entries = await Promise.all(
      FILES.map((filename) => getPogoApiFileHash(filename))
    );

    return {
      sourceHashes: Object.fromEntries(entries.map((entry) => [entry.filename, entry.hash])),
      urls: Object.fromEntries(
        entries.map((entry) => [
          entry.filename,
          new URL(entry.fullPath, "https://pogoapi.net").toString(),
        ])
      ),
    };
  } catch (error) {
    if (existingCache) throw error;

    console.warn(
      "Unable to check PoGoAPI hashes for Pokédex data; downloading the initial files directly",
      error
    );

    return {
      sourceHashes: Object.fromEntries(FILES.map((filename) => [filename, null])),
      urls: Object.fromEntries(
        FILES.map((filename) => [filename, `https://pogoapi.net/api/v1/${filename}`])
      ),
    };
  }
}

async function refreshPokedexInfo(existingCache, options) {
  const checkedAt = new Date().toISOString();
  const sources = await resolveSources(existingCache);

  if (
    existingCache &&
    Object.values(sources.sourceHashes).every(Boolean) &&
    hashesMatch(existingCache.sourceHashes, sources.sourceHashes)
  ) {
    const unchangedCache = options.touchWhenUnchanged
      ? { ...existingCache, checkedAt }
      : existingCache;

    if (options.touchWhenUnchanged) {
      await writeCache(options.cachePath, unchangedCache, options.strictWrite);
    }

    return unchangedCache;
  }

  const [typeRows, effectiveness, evolutionRows] = await Promise.all(
    FILES.map((filename) => fetchJson(sources.urls[filename]))
  );

  const refreshedCache = {
    version: CACHE_VERSION,
    checkedAt,
    sourceHashes: sources.sourceHashes,
    data: buildPokedexInfo(typeRows, effectiveness, evolutionRows),
  };

  const validated = validateCache(refreshedCache);
  if (!validated) {
    throw new Error("PoGoAPI returned an invalid or unexpectedly small Pokédex payload.");
  }

  await writeCache(options.cachePath, validated, options.strictWrite);
  return validated;
}

async function getPokedexInfoData(options = {}) {
  const resolvedOptions = {
    allowStale: options.allowStale !== false,
    cachePath: options.cachePath || runtimeCachePath(),
    forceRefresh: options.forceRefresh === true,
    strictWrite: options.strictWrite === true,
    touchWhenUnchanged: options.touchWhenUnchanged !== false,
  };

  const existingCache = await readCache(resolvedOptions.cachePath);
  if (!resolvedOptions.forceRefresh && isCacheFresh(existingCache)) {
    return { ...existingCache, stale: false };
  }

  if (!refreshPromise) {
    refreshPromise = refreshPokedexInfo(existingCache, resolvedOptions).finally(() => {
      refreshPromise = null;
    });
  }

  try {
    const refreshedCache = await refreshPromise;
    return { ...refreshedCache, stale: false };
  } catch (error) {
    if (resolvedOptions.allowStale && existingCache) {
      console.error("Unable to refresh Pokédex data; using the last valid cache", error);
      return { ...existingCache, stale: true };
    }

    throw error;
  }
}

module.exports = {
  CACHE_TTL_MS,
  getPokedexInfoData,
  isCacheFresh,
  validateCache,
};
