const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const {
  HASH_CACHE_TTL_MS,
  getPogoApiFileHash,
} = require("./pogoApiHashCache");
const { buildPokedexCatalog } = require("./pokedexCatalog");
const { flatPokemonList } = require("./pokedexData");

const CACHE_VERSION = 6;
const CACHE_TTL_MS = HASH_CACHE_TTL_MS;
const REQUEST_TIMEOUT_MS = 15_000;
const MIN_EXPECTED_POKEMON = 100;
const MIN_EXPECTED_RESOURCE_ENTRIES = 100;
const MIN_EXPECTED_MEGA_POKEMON = 20;
const SITE_POKEDEX_FILE_KEY = "site_pokedex";
const POGOAPI_FILES = [
  "pokemon_types.json",
  "pokemon_evolutions.json",
  "pokemon_buddy_distances.json",
  "mega_pokemon.json",
];
const PVPOKE_FILE_KEY = "pvpoke_pokemon.json";
const REMOTE_SOURCE_KEYS = [...POGOAPI_FILES, PVPOKE_FILE_KEY];
const SOURCE_KEYS = [SITE_POKEDEX_FILE_KEY, ...REMOTE_SOURCE_KEYS];
const PVPOKE_CONTENTS_API_URL =
  "https://api.github.com/repos/pvpoke/pvpoke/contents/src/data/gamemaster/pokemon.json?ref=master";
const PVPOKE_RAW_URL =
  "https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/gamemaster/pokemon.json";

const memoryCaches = new Map();
const refreshPromises = new Map();

const runtimeCachePath = () =>
  process.env.POGOAPI_POKEDEX_CATALOG_CACHE_PATH ||
  path.join(process.cwd(), "data", ".cache", "pokedex-catalog.json");

function authoritativePokemonRows() {
  const rows = (Array.isArray(flatPokemonList) ? flatPokemonList : [])
    .map((pokemon) => ({
      dexNumber: Number(pokemon?.dexNumber),
      name: typeof pokemon?.name === "string" ? pokemon.name.trim() : "",
    }))
    .filter(
      ({ dexNumber, name }) =>
        Number.isInteger(dexNumber) && dexNumber > 0 && Boolean(name)
    );

  if (rows.length < MIN_EXPECTED_POKEMON) {
    throw new Error("The site Pokédex list was unexpectedly small.");
  }

  return rows;
}

function buildAuthoritativeNamesPayload() {
  return Object.fromEntries(
    authoritativePokemonRows().map(({ dexNumber, name }) => [
      dexNumber,
      { id: dexNumber, name },
    ])
  );
}

function sitePokedexHash() {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(authoritativePokemonRows()))
    .digest("hex");
}

function validateCache(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (value.version !== CACHE_VERSION) return null;
  if (!value.checkedAt || !Number.isFinite(Date.parse(value.checkedAt))) return null;
  if (!value.sourceHashes || typeof value.sourceHashes !== "object") return null;
  if (value.sourceHashes[SITE_POKEDEX_FILE_KEY] !== sitePokedexHash()) return null;
  if (!value.data || typeof value.data !== "object") return null;
  if (!Array.isArray(value.data.regions)) return null;
  if (!value.data.pokemon || typeof value.data.pokemon !== "object") return null;
  if (Object.keys(value.data.pokemon).length < MIN_EXPECTED_POKEMON) return null;

  const pokemonDetails = Object.values(value.data.pokemon);
  const buddyDistanceEntries = pokemonDetails.filter((details) => {
    const distance = Number(details?.buddyDistance);
    return Number.isFinite(distance) && distance > 0;
  }).length;
  const secondMoveCostEntries = pokemonDetails.filter((details) => {
    const stardust = Number(details?.secondMoveCost?.stardust);
    return Number.isFinite(stardust) && stardust > 0;
  }).length;
  const megaPokemonEntries = pokemonDetails.filter(
    (details) =>
      Array.isArray(details?.megaEvolutions) &&
      details.megaEvolutions.length > 0
  ).length;

  if (
    buddyDistanceEntries < MIN_EXPECTED_RESOURCE_ENTRIES ||
    secondMoveCostEntries < MIN_EXPECTED_RESOURCE_ENTRIES ||
    megaPokemonEntries < MIN_EXPECTED_MEGA_POKEMON
  ) {
    return null;
  }

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
  const memoryCache = memoryCaches.get(filePath);
  if (memoryCache) return memoryCache;

  try {
    const parsed = JSON.parse(await fs.readFile(filePath, "utf8"));
    const cache = validateCache(parsed);
    if (cache) memoryCaches.set(filePath, cache);
    return cache;
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) return null;
    throw error;
  }
}

async function fetchJson(url, extraHeaders = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "LEIGHPOGO pokedex-catalog-cache",
        ...extraHeaders,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Catalog source request failed with status ${response.status}.`);
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
    memoryCaches.set(filePath, cache);
  } catch (error) {
    try {
      await fs.unlink(temporaryPath);
    } catch {}

    if (strictWrite) throw error;
    console.error("Unable to persist the Pokédex catalog cache", error);
  }
}

function hashesMatch(left, right) {
  return SOURCE_KEYS.every(
    (sourceKey) => left?.[sourceKey] && left[sourceKey] === right?.[sourceKey]
  );
}

async function resolvePogoApiSources(existingCache) {
  try {
    const entries = await Promise.all(
      POGOAPI_FILES.map((filename) => getPogoApiFileHash(filename))
    );

    return {
      sourceHashes: Object.fromEntries(
        entries.map((entry) => [entry.filename, entry.hash])
      ),
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
      "Unable to check POGOAPI hashes for the initial Pokédex catalog; downloading the files directly",
      error
    );

    return {
      sourceHashes: Object.fromEntries(
        POGOAPI_FILES.map((filename) => [filename, null])
      ),
      urls: Object.fromEntries(
        POGOAPI_FILES.map((filename) => [
          filename,
          `https://pogoapi.net/api/v1/${filename}`,
        ])
      ),
    };
  }
}

async function resolvePvpokeSource(existingCache) {
  try {
    const metadata = await fetchJson(PVPOKE_CONTENTS_API_URL, {
      Accept: "application/vnd.github+json",
    });
    if (!metadata?.sha || !metadata?.download_url) {
      throw new Error("PvPoke returned invalid file metadata.");
    }

    return {
      sourceHashes: { [PVPOKE_FILE_KEY]: metadata.sha },
      urls: { [PVPOKE_FILE_KEY]: metadata.download_url },
    };
  } catch (error) {
    if (existingCache) throw error;

    console.warn(
      "Unable to check the initial PvPoke Pokémon data hash; downloading the file directly",
      error
    );

    return {
      sourceHashes: { [PVPOKE_FILE_KEY]: null },
      urls: { [PVPOKE_FILE_KEY]: PVPOKE_RAW_URL },
    };
  }
}

async function resolveSources(existingCache) {
  const [pogoApiSources, pvpokeSource] = await Promise.all([
    resolvePogoApiSources(existingCache),
    resolvePvpokeSource(existingCache),
  ]);

  return {
    sourceHashes: {
      [SITE_POKEDEX_FILE_KEY]: sitePokedexHash(),
      ...pogoApiSources.sourceHashes,
      ...pvpokeSource.sourceHashes,
    },
    urls: {
      ...pogoApiSources.urls,
      ...pvpokeSource.urls,
    },
  };
}

async function refreshPokedexCatalog(existingCache, options) {
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

  const [
    pokemonTypes,
    pokemonEvolutions,
    pokemonBuddyDistances,
    megaPokemon,
    pvpokePokemon,
  ] = await Promise.all(
    REMOTE_SOURCE_KEYS.map((sourceKey) => fetchJson(sources.urls[sourceKey]))
  );

  const refreshedCache = validateCache({
    version: CACHE_VERSION,
    checkedAt,
    sourceHashes: sources.sourceHashes,
    data: buildPokedexCatalog(
      buildAuthoritativeNamesPayload(),
      pokemonTypes,
      pokemonEvolutions,
      pokemonBuddyDistances,
      pvpokePokemon,
      megaPokemon
    ),
  });

  if (!refreshedCache) {
    throw new Error("The catalog sources returned an invalid Pokédex payload.");
  }

  await writeCache(options.cachePath, refreshedCache, options.strictWrite);
  return refreshedCache;
}

async function getPokedexCatalogData(options = {}) {
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

  if (!refreshPromises.has(resolvedOptions.cachePath)) {
    refreshPromises.set(
      resolvedOptions.cachePath,
      refreshPokedexCatalog(existingCache, resolvedOptions).finally(() => {
        refreshPromises.delete(resolvedOptions.cachePath);
      })
    );
  }

  try {
    const refreshedCache = await refreshPromises.get(resolvedOptions.cachePath);
    return { ...refreshedCache, stale: false };
  } catch (error) {
    if (resolvedOptions.allowStale && existingCache) {
      console.error(
        "Unable to refresh the Pokédex catalog; using the last valid cache",
        error
      );
      return { ...existingCache, stale: true };
    }

    throw error;
  }
}

module.exports = {
  CACHE_TTL_MS,
  buildAuthoritativeNamesPayload,
  getPokedexCatalogData,
  isCacheFresh,
  sitePokedexHash,
  validateCache,
};
