const fs = require("fs/promises");
const path = require("path");
const {
  HASH_CACHE_TTL_MS,
  getPogoApiFileHash,
} = require("./pogoApiHashCache");

const RAID_BOSSES_FILENAME = "raid_bosses.json";
const RAID_BOSSES_URL = "https://pogoapi.net/api/v1/raid_bosses.json";
const CACHE_TTL_MS = HASH_CACHE_TTL_MS;
const MIN_EXPECTED_RAID_BOSSES = 1;
const REQUEST_TIMEOUT_MS = 15_000;

let refreshPromise = null;

const runtimeCachePath = () =>
  process.env.POGOAPI_RAID_BOSS_CACHE_PATH ||
  path.join(process.cwd(), "data", ".cache", "raid-boss-cp.json");

function optionalString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function normaliseTier(value) {
  const tier = optionalString(String(value ?? ""));

  return tier ? tier.toLowerCase().replace(/[_-]+/g, " ") : "unknown";
}

function normaliseRaidBoss(value, tierKey) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const name = optionalString(value.name ?? value.pokemon_name);
  const maxUnboostedCp = positiveInteger(
    value.max_unboosted_cp ?? value.maxUnboostedCp
  );
  const maxBoostedCp = positiveInteger(
    value.max_boosted_cp ?? value.maxBoostedCp
  );

  if (!name || !maxUnboostedCp || !maxBoostedCp) {
    return null;
  }

  return {
    name,
    form: optionalString(value.form) || "Normal",
    tier: normaliseTier(value.tier ?? tierKey),
    maxUnboostedCp,
    maxBoostedCp,
  };
}

function normaliseBossName(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[’']/g, "")
    .replace(/\b(?:forme?|mega|shadow)\b/gi, " ")
    .replace(/[^a-z0-9♀♂]+/gi, " ")
    .trim()
    .toLowerCase();
}

function extractCurrentRaidBosses(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("PoGoAPI returned an invalid raid boss payload.");
  }

  const current = payload.current;

  if (!current || typeof current !== "object" || Array.isArray(current)) {
    throw new Error("PoGoAPI raid boss payload did not include current bosses.");
  }

  const bosses = Object.entries(current).flatMap(([tier, values]) =>
    Array.isArray(values)
      ? values
          .map((value) => normaliseRaidBoss(value, tier))
          .filter((boss) => boss !== null)
      : []
  );
  const uniqueBosses = Array.from(
    new Map(
      bosses.map((boss) => [
        [
          normaliseBossName(boss.name),
          normaliseBossName(boss.form),
          boss.tier,
          boss.maxUnboostedCp,
          boss.maxBoostedCp,
        ].join("|"),
        boss,
      ])
    ).values()
  );

  if (uniqueBosses.length < MIN_EXPECTED_RAID_BOSSES) {
    throw new Error("PoGoAPI current raid boss payload was unexpectedly empty.");
  }

  return uniqueBosses;
}

function validateCache(cache) {
  if (!cache || typeof cache !== "object" || Array.isArray(cache)) return null;
  if (!Array.isArray(cache.bosses)) return null;

  const bosses = cache.bosses
    .map((boss) => normaliseRaidBoss(boss, boss?.tier))
    .filter((boss) => boss !== null);

  if (bosses.length < MIN_EXPECTED_RAID_BOSSES) return null;

  const checkedAt = new Date(cache.checkedAt).toISOString();

  return {
    checkedAt,
    sourceHash: typeof cache.sourceHash === "string" ? cache.sourceHash : null,
    bosses,
  };
}

function isCacheFresh(cache, maxAgeMs = CACHE_TTL_MS, now = Date.now()) {
  if (!cache?.checkedAt) return false;

  const checkedAt = Date.parse(cache.checkedAt);
  return Number.isFinite(checkedAt) && now - checkedAt < maxAgeMs;
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
  try {
    return validateCache(await readJson(filePath));
  } catch {
    return null;
  }
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "LEIGHPOGO raid-boss-cp-cache",
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
    console.error("Unable to persist the raid boss CP cache", error);
  }
}

async function refreshRaidBossCpData(existingCache, options) {
  const checkedAt = new Date().toISOString();
  let sourceHash = null;
  let raidBossesUrl = RAID_BOSSES_URL;

  try {
    const hashEntry = await getPogoApiFileHash(RAID_BOSSES_FILENAME);
    sourceHash = hashEntry.hash;
    raidBossesUrl = new URL(
      hashEntry.fullPath,
      "https://pogoapi.net"
    ).toString();
  } catch (error) {
    if (existingCache) {
      throw error;
    }

    console.warn(
      "Unable to check the PoGoAPI hash manifest; downloading the initial raid boss data directly",
      error
    );
  }

  if (
    sourceHash &&
    existingCache?.sourceHash === sourceHash &&
    existingCache.bosses.length >= MIN_EXPECTED_RAID_BOSSES
  ) {
    const unchangedCache = options.touchWhenUnchanged
      ? { ...existingCache, checkedAt }
      : existingCache;

    if (options.touchWhenUnchanged) {
      await writeCache(options.cachePath, unchangedCache, options.strictWrite);
    }

    return unchangedCache;
  }

  const raidBosses = await fetchJson(raidBossesUrl);
  const refreshedCache = {
    checkedAt,
    sourceHash,
    bosses: extractCurrentRaidBosses(raidBosses),
  };

  await writeCache(options.cachePath, refreshedCache, options.strictWrite);
  return refreshedCache;
}

async function getRaidBossCpData(options = {}) {
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
    refreshPromise = refreshRaidBossCpData(existingCache, resolvedOptions).finally(
      () => {
        refreshPromise = null;
      }
    );
  }

  try {
    const refreshedCache = await refreshPromise;
    return { ...refreshedCache, stale: false };
  } catch (error) {
    if (resolvedOptions.allowStale && existingCache) {
      console.error("Unable to refresh raid boss CP data; using stale cache", error);
      return { ...existingCache, stale: true };
    }

    throw error;
  }
}

function bossAliases(boss) {
  const form = normaliseBossName(boss.form);
  const name = normaliseBossName(boss.name);

  return Array.from(
    new Set(
      [
        name,
        form && form !== "normal" ? `${form} ${name}` : null,
        form && form !== "normal" ? `${name} ${form}` : null,
      ]
        .filter(Boolean)
        .map(normaliseBossName)
    )
  );
}

function displayBossName(boss) {
  const name = optionalString(boss.name) || "Raid boss";
  const form = optionalString(boss.form);
  const normalisedForm = normaliseBossName(form);

  if (
    !form ||
    !normalisedForm ||
    normalisedForm === "normal" ||
    String(form).trim().toLowerCase() === "shadow" ||
    normaliseBossName(name).includes(normalisedForm)
  ) {
    return name;
  }

  const readableForm = form.replace(/_/g, " ");

  return /^[xy]$/i.test(readableForm)
    ? `${name} ${readableForm}`
    : `${readableForm} ${name}`;
}

function itemBossParts(value) {
  return String(value ?? "")
    .replace(/\s+(?:and|&)\s+/gi, ",")
    .replace(/\s*\/\s*/g, ",")
    .split(",")
    .map(normaliseBossName)
    .filter(Boolean);
}

function categoryMatches(item, boss) {
  const tier = normaliseTier(boss.tier);
  const rawForm = String(boss.form ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ");
  const name = String(boss.name ?? "").trim().toLowerCase();
  const isMega =
    tier.includes("mega") ||
    rawForm.includes("mega") ||
    name.startsWith("mega ");
  const isShadow =
    tier.includes("shadow") ||
    rawForm.includes("shadow") ||
    name.startsWith("shadow ");

  if (item.category === "mega") return isMega;
  if (item.category === "shadow") return isShadow;

  return (
    !isMega &&
    !isShadow &&
    (tier === "5" ||
      tier === "6" ||
      tier.includes("five star") ||
      tier.includes("5 star"))
  );
}

function findRaidBossCpMatches(item, bosses) {
  const parts = itemBossParts(item.boss);

  if (parts.length === 0 || !Array.isArray(bosses)) return [];

  const matches = bosses.filter((boss) => {
    if (!categoryMatches(item, boss)) return false;

    const aliases = bossAliases(boss);

    return parts.some((part) =>
      aliases.some(
        (alias) =>
          alias === part ||
          (alias.length >= 4 && part.includes(alias)) ||
          (part.length >= 4 && alias.includes(part))
      )
    );
  });

  return Array.from(
    new Map(
      matches.map((boss) => {
        const displayName = displayBossName(boss);

        return [
          `${normaliseBossName(displayName)}|${boss.maxUnboostedCp}|${boss.maxBoostedCp}`,
          {
            boss: displayName,
            maxUnboostedCp: boss.maxUnboostedCp,
            maxBoostedCp: boss.maxBoostedCp,
          },
        ];
      })
    ).values()
  ).sort((left, right) => {
    const leftAliases = bossAliases({ name: left.boss, form: "Normal" });
    const rightAliases = bossAliases({ name: right.boss, form: "Normal" });
    const leftIndex = parts.findIndex((part) =>
      leftAliases.some(
        (alias) => alias === part || part.includes(alias) || alias.includes(part)
      )
    );
    const rightIndex = parts.findIndex((part) =>
      rightAliases.some(
        (alias) => alias === part || part.includes(alias) || alias.includes(part)
      )
    );

    return leftIndex - rightIndex || left.boss.localeCompare(right.boss);
  });
}

function attachRaidBossCp(items, bosses) {
  if (!Array.isArray(items)) return [];

  return items.map((item) => {
    const catchCp = findRaidBossCpMatches(item, bosses);

    return catchCp.length > 0 ? { ...item, catchCp } : item;
  });
}

module.exports = {
  CACHE_TTL_MS,
  attachRaidBossCp,
  extractCurrentRaidBosses,
  findRaidBossCpMatches,
  getRaidBossCpData,
  isCacheFresh,
  normaliseBossName,
};
