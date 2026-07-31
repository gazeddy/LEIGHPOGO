const fs = require("fs/promises");
const path = require("path");

const API_HASHES_URL = "https://pogoapi.net/api/v1/api_hashes.json";
const HASH_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const HASH_CACHE_VERSION = 1;
const MIN_EXPECTED_HASH_ENTRIES = 10;
const REQUEST_TIMEOUT_MS = 15_000;

const memoryCaches = new Map();
const refreshPromises = new Map();

const runtimeCachePath = () =>
  process.env.POGOAPI_HASH_CACHE_PATH ||
  path.join(process.cwd(), "data", ".cache", "pogoapi-api-hashes.json");

function optionalString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normaliseHashEntry(filename, value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const apiFilename = optionalString(value.api_filename) || optionalString(filename);
  const fullPath = optionalString(value.full_path);
  const hashMd5 = optionalString(value.hash_md5);
  const hashSha1 = optionalString(value.hash_sha1);
  const hashSha256 = optionalString(value.hash_sha256);

  if (!apiFilename || !fullPath || (!hashSha256 && !hashSha1 && !hashMd5)) {
    return null;
  }

  return {
    api_filename: apiFilename,
    full_path: fullPath,
    hash_md5: hashMd5,
    hash_sha1: hashSha1,
    hash_sha256: hashSha256,
  };
}

function normaliseHashManifest(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("PoGoAPI returned an invalid API hash manifest.");
  }

  const hashes = Object.fromEntries(
    Object.entries(payload)
      .map(([filename, value]) => [filename, normaliseHashEntry(filename, value)])
      .filter(([, value]) => value !== null)
  );

  if (Object.keys(hashes).length < MIN_EXPECTED_HASH_ENTRIES) {
    throw new Error("PoGoAPI API hash manifest was unexpectedly small.");
  }

  return hashes;
}

function selectPreferredHash(entry) {
  if (!entry || typeof entry !== "object") return null;

  return entry.hash_sha256 || entry.hash_sha1 || entry.hash_md5 || null;
}

function isHashCacheFresh(cache, maxAgeMs = HASH_CACHE_TTL_MS, now = Date.now()) {
  if (!cache?.checkedAt) return false;

  const checkedAt = Date.parse(cache.checkedAt);
  return Number.isFinite(checkedAt) && now - checkedAt < maxAgeMs;
}

function validateStoredCache(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (value.version !== HASH_CACHE_VERSION) return null;

  const checkedAt = optionalString(value.checkedAt);
  if (!checkedAt || !Number.isFinite(Date.parse(checkedAt))) return null;

  try {
    return {
      version: HASH_CACHE_VERSION,
      checkedAt: new Date(checkedAt).toISOString(),
      hashes: normaliseHashManifest(value.hashes),
    };
  } catch {
    return null;
  }
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
  const memoryCache = memoryCaches.get(filePath);
  if (memoryCache) return memoryCache;

  const cache = validateStoredCache(await readJson(filePath));
  if (cache) memoryCaches.set(filePath, cache);
  return cache;
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "LEIGHPOGO pogoapi-hash-cache",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`PoGoAPI hash request failed with status ${response.status}.`);
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
  } catch (error) {
    try {
      await fs.unlink(temporaryPath);
    } catch {}

    if (strictWrite) throw error;
    console.error("Unable to persist the PoGoAPI hash manifest cache", error);
  }
}

async function refreshHashManifest(filePath, strictWrite) {
  const cache = {
    version: HASH_CACHE_VERSION,
    checkedAt: new Date().toISOString(),
    hashes: normaliseHashManifest(await fetchJson(API_HASHES_URL)),
  };

  memoryCaches.set(filePath, cache);
  await writeCache(filePath, cache, strictWrite);
  return cache;
}

async function getPogoApiHashManifest(options = {}) {
  const cachePath = options.cachePath || runtimeCachePath();
  const allowStale = options.allowStale !== false;
  const forceRefresh = options.forceRefresh === true;
  const strictWrite = options.strictWrite === true;
  const existingCache = await readCache(cachePath);

  if (!forceRefresh && isHashCacheFresh(existingCache)) {
    return { ...existingCache, stale: false, warning: null };
  }

  if (!refreshPromises.has(cachePath)) {
    refreshPromises.set(
      cachePath,
      refreshHashManifest(cachePath, strictWrite).finally(() => {
        refreshPromises.delete(cachePath);
      })
    );
  }

  try {
    const refreshedCache = await refreshPromises.get(cachePath);
    return { ...refreshedCache, stale: false, warning: null };
  } catch (error) {
    if (allowStale && existingCache) {
      return {
        ...existingCache,
        stale: true,
        warning:
          error instanceof Error
            ? `The PoGoAPI hash manifest refresh failed: ${error.message}`
            : "The PoGoAPI hash manifest refresh failed.",
      };
    }

    throw error;
  }
}

async function getPogoApiFileHash(filename, options = {}) {
  const manifest = await getPogoApiHashManifest(options);
  const entry = manifest.hashes[filename];
  const hash = selectPreferredHash(entry);

  if (!entry || !hash) {
    throw new Error(`PoGoAPI hash manifest does not contain ${filename}.`);
  }

  return {
    filename,
    fullPath: entry.full_path,
    hash,
    checkedAt: manifest.checkedAt,
    stale: manifest.stale,
    warning: manifest.warning,
  };
}

module.exports = {
  API_HASHES_URL,
  HASH_CACHE_TTL_MS,
  getPogoApiFileHash,
  getPogoApiHashManifest,
  isHashCacheFresh,
  normaliseHashManifest,
  selectPreferredHash,
};
