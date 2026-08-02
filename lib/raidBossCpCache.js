const fs = require("fs/promises");
const path = require("path");

const RAID_BOSSES_URL = "https://pogoapi.net/api/v1/raid_bosses.json";
const CACHE_VERSION = 3;
const CACHE_TTL_MS = 60 * 60 * 1000;
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
    value.max_unboosted_cp ?? value.maxUnboostedCp,
  );
  const maxBoostedCp = positiveInteger(
    value.max_boosted_cp ?? value.maxBoostedCp,
  );

  if (!name || !maxUnboostedCp || !maxBoostedCp) {
    return null;
  }

  return {
    name,
    form: optionalString(value.form) || "Normal",
    // The containing group is authoritative. This distinguishes Mega raid CP
    // from the ordinary Pokémon's CP even when the entry has a numeric tier.
    tier: normaliseTier(tierKey ?? value.tier),
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

function extractRaidBossSection(section) {
  if (!section || typeof section !== "object" || Array.isArray(section)) {
    return [];
  }

  return Object.entries(section).flatMap(([tier, values]) =>
    Array.isArray(values)
      ? values
          .map((value) => normaliseRaidBoss(value, tier))
          .filter((boss) => boss !== null)
      : [],
  );
}

function extractCurrentRaidBosses(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("PoGoAPI returned an invalid raid boss payload.");
  }

  const hasCurrent =
    payload.current &&
    typeof payload.current === "object" &&
    !Array.isArray(payload.current);
  const hasPrevious =
    payload.previous &&
    typeof payload.previous === "object" &&
    !Array.isArray(payload.previous);

  if (!hasCurrent && !hasPrevious) {
    throw new Error(
      "PoGoAPI raid boss payload did not include current or previous bosses.",
    );
  }

  // PoGoAPI's `current` rotation can lag the event feed. Search it first, then
  // retain `previous` as a fallback for bosses that have already rotated in the
  // event source. Input order also ensures current wins an otherwise exact tie.
  const bosses = [
    ...extractRaidBossSection(hasCurrent ? payload.current : null),
    ...extractRaidBossSection(hasPrevious ? payload.previous : null),
  ];
  const uniqueBosses = new Map();

  for (const boss of bosses) {
    const key = [
      normaliseBossName(boss.name),
      normaliseBossName(boss.form),
      boss.tier,
      boss.maxUnboostedCp,
      boss.maxBoostedCp,
    ].join("|");

    if (!uniqueBosses.has(key)) {
      uniqueBosses.set(key, boss);
    }
  }

  const result = Array.from(uniqueBosses.values());

  if (result.length < MIN_EXPECTED_RAID_BOSSES) {
    throw new Error("PoGoAPI raid boss payload was unexpectedly empty.");
  }

  return result;
}

function validateCache(cache) {
  if (!cache || typeof cache !== "object" || Array.isArray(cache)) return null;
  if (cache.version !== CACHE_VERSION || !Array.isArray(cache.bosses)) {
    return null;
  }

  const bosses = cache.bosses
    .map((boss) => normaliseRaidBoss(boss, boss?.tier))
    .filter((boss) => boss !== null);
  const checkedAtDate = new Date(cache.checkedAt);

  if (
    bosses.length < MIN_EXPECTED_RAID_BOSSES ||
    Number.isNaN(checkedAtDate.getTime())
  ) {
    return null;
  }

  return {
    version: CACHE_VERSION,
    checkedAt: checkedAtDate.toISOString(),
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
      "utf8",
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

async function refreshRaidBossCpData(options) {
  const refreshedCache = {
    version: CACHE_VERSION,
    checkedAt: new Date().toISOString(),
    bosses: extractCurrentRaidBosses(await fetchJson(RAID_BOSSES_URL)),
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
  };
  const existingCache = await readCache(resolvedOptions.cachePath);

  if (!resolvedOptions.forceRefresh && isCacheFresh(existingCache)) {
    return { ...existingCache, stale: false };
  }

  if (!refreshPromise) {
    refreshPromise = refreshRaidBossCpData(resolvedOptions).finally(() => {
      refreshPromise = null;
    });
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
        .map(normaliseBossName),
    ),
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

function bossCategoryFlags(boss) {
  const tier = normaliseTier(boss.tier);
  const form = String(boss.form ?? "")
    .toLowerCase()
    .replace(/[_-]+/g, " ");
  const name = String(boss.name ?? "").toLowerCase();

  return {
    isMega:
      tier === "mega" ||
      tier === "mega legendary" ||
      form.includes("mega") ||
      name.startsWith("mega "),
    isShadow: form.includes("shadow") || name.startsWith("shadow "),
    isFiveStar:
      tier === "5" ||
      tier === "6" ||
      tier === "ex" ||
      tier.includes("five star") ||
      tier.includes("5 star"),
  };
}

function nameMatchScore(part, boss) {
  return bossAliases(boss).reduce((best, alias) => {
    if (alias === part) return Math.max(best, 100);
    if (alias.length >= 4 && part.includes(alias)) return Math.max(best, 60);
    if (part.length >= 4 && alias.includes(part)) return Math.max(best, 50);
    return best;
  }, -1);
}

function categoryPreferenceScore(item, boss) {
  const { isMega, isShadow, isFiveStar } = bossCategoryFlags(boss);

  if (item.category === "mega") {
    return isMega ? 30 : -10;
  }

  if (item.category === "shadow") {
    // PoGoAPI may provide a Shadow raid boss only as the ordinary Pokémon's
    // tier-five record, so retain a same-name non-Mega fallback.
    return isShadow ? 30 : isMega ? -20 : 0;
  }

  if (isMega || isShadow) return -20;
  return isFiveStar ? 20 : 0;
}

function findBestBossMatch(item, part, bosses) {
  return bosses
    .map((boss, index) => ({
      boss,
      index,
      nameScore: nameMatchScore(part, boss),
      categoryScore: categoryPreferenceScore(item, boss),
    }))
    .filter((candidate) => candidate.nameScore >= 0)
    .sort((left, right) => {
      const totalDifference =
        right.nameScore + right.categoryScore -
        (left.nameScore + left.categoryScore);

      return (
        totalDifference ||
        right.nameScore - left.nameScore ||
        left.index - right.index
      );
    })[0]?.boss;
}

function findRaidBossCpMatches(item, bosses) {
  const parts = itemBossParts(item.boss);

  if (parts.length === 0 || !Array.isArray(bosses)) return [];

  return Array.from(
    new Map(
      parts
        .map((part) => findBestBossMatch(item, part, bosses))
        .filter(Boolean)
        .map((boss) => {
          const displayName = displayBossName(boss);
          const match = {
            boss: displayName,
            maxUnboostedCp: boss.maxUnboostedCp,
            maxBoostedCp: boss.maxBoostedCp,
          };

          return [
            `${normaliseBossName(displayName)}|${match.maxUnboostedCp}|${match.maxBoostedCp}`,
            match,
          ];
        }),
    ).values(),
  );
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
