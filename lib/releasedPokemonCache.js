const fs = require("fs/promises");
const path = require("path");
const {
  HASH_CACHE_TTL_MS,
  getPogoApiFileHash,
} = require("./pogoApiHashCache");

const RELEASED_POKEMON_FILENAME = "released_pokemon.json";
const RELEASED_POKEMON_URL =
  "https://pogoapi.net/api/v1/released_pokemon.json";
const CACHE_TTL_MS = HASH_CACHE_TTL_MS;
const MIN_EXPECTED_RELEASED_POKEMON = 100;
const REQUEST_TIMEOUT_MS = 15_000;

let refreshPromise = null;

const runtimeCachePath = () =>
  process.env.POGOAPI_RELEASED_CACHE_PATH ||
  path.join(process.cwd(), "data", ".cache", "released-pokemon.json");

const bootstrapCachePath = () =>
  process.env.POGOAPI_RELEASED_BOOTSTRAP_PATH ||
  path.join(process.cwd(), "data", "pogoapi", "released-pokemon.json");

function normaliseDexNumbers(values) {
  if (!Array.isArray(values)) return [];

  return Array.from(
    new Set(
      values
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0)
    )
  ).sort((a, b) => a - b);
}

function extractReleasedDexNumbers(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("PogoAPI returned an invalid released Pokémon payload.");
  }

  const dexNumbers = normaliseDexNumbers(
    Object.entries(payload).map(([key, pokemon]) => pokemon?.id ?? key)
  );

  if (dexNumbers.length < MIN_EXPECTED_RELEASED_POKEMON) {
    throw new Error("PogoAPI released Pokémon payload was unexpectedly small.");
  }

  return dexNumbers;
}

function validateCache(cache) {
  if (!cache || typeof cache !== "object") return null;

  const dexNumbers = normaliseDexNumbers(cache.dexNumbers);
  if (dexNumbers.length < MIN_EXPECTED_RELEASED_POKEMON) return null;

  const checkedAt = new Date(cache.checkedAt).toISOString();

  return {
    checkedAt,
    sourceHash: typeof cache.sourceHash === "string" ? cache.sourceHash : null,
    dexNumbers,
  };
}

function isCacheFresh(cache, maxAgeMs = CACHE_TTL_MS, now = Date.now()) {
  if (!cache?.checkedAt) return false;
  const checkedAt = Date.parse(cache.checkedAt);
  return Number.isFinite(checkedAt) && now - checkedAt < maxAgeMs;
}

function filterReleasedDexNumbers(values, releasedDexNumbers) {
  const releasedSet = new Set(normaliseDexNumbers(releasedDexNumbers));
  return normaliseDexNumbers(values).filter((dexNumber) =>
    releasedSet.has(dexNumber)
  );
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) return null;
    throw error;
  }
}

async function readCache(filePath) {
  const rawCache = await readJson(filePath);
  try {
    return validateCache(rawCache);
  } catch {
    return null;
  }
}

async function readBestCache(targetPath, includeBootstrap) {
  const targetCache = await readCache(targetPath);
  if (targetCache) return targetCache;

  if (includeBootstrap && targetPath !== bootstrapCachePath()) {
    return readCache(bootstrapCachePath());
  }

  return null;
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "LEIGHPOGO released-pokemon-cache",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`PogoAPI request failed with status ${response.status}.`);
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
    await fs.writeFile(
      temporaryPath,
      `${JSON.stringify(cache, null, 2)}\n`,
      "utf8"
    );
    await fs.rename(temporaryPath, filePath);
  } catch (error) {
    try {
      await fs.unlink(temporaryPath);
    } catch {}

    if (strictWrite) throw error;
    console.error("Unable to persist the released Pokémon cache", error);
  }
}

async function refreshReleasedPokemonData(existingCache, options) {
  const checkedAt = new Date().toISOString();
  let sourceHash = null;
  let releasedPokemonUrl = RELEASED_POKEMON_URL;

  try {
    const hashEntry = await getPogoApiFileHash(RELEASED_POKEMON_FILENAME);
    sourceHash = hashEntry.hash;
    releasedPokemonUrl = new URL(
      hashEntry.fullPath,
      "https://pogoapi.net"
    ).toString();
  } catch (error) {
    if (existingCache) {
      throw error;
    }

    console.warn(
      "Unable to check the PoGoAPI hash manifest; downloading the initial released Pokémon list directly",
      error
    );
  }

  if (
    sourceHash &&
    existingCache?.sourceHash === sourceHash &&
    existingCache.dexNumbers.length >= MIN_EXPECTED_RELEASED_POKEMON
  ) {
    const unchangedCache = options.touchWhenUnchanged
      ? { ...existingCache, checkedAt }
      : existingCache;

    if (options.touchWhenUnchanged) {
      await writeCache(options.cachePath, unchangedCache, options.strictWrite);
    }

    return unchangedCache;
  }

  const releasedPokemon = await fetchJson(releasedPokemonUrl);
  const refreshedCache = {
    checkedAt,
    sourceHash,
    dexNumbers: extractReleasedDexNumbers(releasedPokemon),
  };

  await writeCache(options.cachePath, refreshedCache, options.strictWrite);
  return refreshedCache;
}

async function getReleasedPokemonData(options = {}) {
  const resolvedOptions = {
    allowStale: options.allowStale !== false,
    cachePath: options.cachePath || runtimeCachePath(),
    forceRefresh: options.forceRefresh === true,
    includeBootstrap: options.includeBootstrap !== false,
    strictWrite: options.strictWrite === true,
    touchWhenUnchanged: options.touchWhenUnchanged !== false,
  };

  const existingCache = await readBestCache(
    resolvedOptions.cachePath,
    resolvedOptions.includeBootstrap
  );

  if (!resolvedOptions.forceRefresh && isCacheFresh(existingCache)) {
    return { ...existingCache, stale: false };
  }

  if (!refreshPromise) {
    refreshPromise = refreshReleasedPokemonData(
      existingCache,
      resolvedOptions
    ).finally(() => {
      refreshPromise = null;
    });
  }

  try {
    const refreshedCache = await refreshPromise;
    return { ...refreshedCache, stale: false };
  } catch (error) {
    if (resolvedOptions.allowStale && existingCache) {
      console.error(
        "Unable to refresh released Pokémon; using the last valid cache",
        error
      );
      return { ...existingCache, stale: true };
    }

    throw error;
  }
}

module.exports = {
  CACHE_TTL_MS,
  extractReleasedDexNumbers,
  filterReleasedDexNumbers,
  getReleasedPokemonData,
  isCacheFresh,
  normaliseDexNumbers,
};
