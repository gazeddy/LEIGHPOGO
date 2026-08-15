import fs from "node:fs/promises";
import path from "node:path";
import {
  getRaidBossCpData,
  normaliseBossName,
  type PogoApiRaidBossCp,
} from "./raidBossCpCache";
import type {
  RaidBossProfileData,
  RaidBossTickerItem,
  RaidCategory,
  RaidTypeMatchup,
} from "./events";

const CACHE_VERSION = 1;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15_000;
const POKEMON_TYPES_URL = "https://pogoapi.net/api/v1/pokemon_types.json";
const MEGA_POKEMON_URL = "https://pogoapi.net/api/v1/mega_pokemon.json";
const TYPE_EFFECTIVENESS_URL = "https://pogoapi.net/api/v1/type_effectiveness.json";
const WEATHER_BOOSTS_URL = "https://pogoapi.net/api/v1/weather_boosts.json";

const cachePath = () =>
  process.env.POGOAPI_RAID_DETAIL_CACHE_PATH ||
  path.join(process.cwd(), "data", ".cache", "raid-details.json");

interface PokemonTypeRecord {
  pokemon_id: number;
  pokemon_name: string;
  form?: string;
  type: string[];
}

interface MegaPokemonRecord {
  pokemon_id: number;
  pokemon_name: string;
  mega_name: string;
  form?: string;
  type: string[];
}

type TypeEffectiveness = Record<string, Record<string, string | number>>;
type WeatherBoosts = Record<string, string[]>;

interface SupplementCache {
  version: number;
  checkedAt: string;
  pokemonTypes: PokemonTypeRecord[];
  megaPokemon: MegaPokemonRecord[];
  effectiveness: TypeEffectiveness;
  weatherBoosts: WeatherBoosts;
}

let refreshPromise: Promise<SupplementCache> | null = null;
let memoryCache: SupplementCache | null = null;

function validStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim()))
    : [];
}

function validateCache(value: unknown): SupplementCache | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<SupplementCache>;
  if (
    candidate.version !== CACHE_VERSION ||
    typeof candidate.checkedAt !== "string" ||
    !Number.isFinite(Date.parse(candidate.checkedAt)) ||
    !Array.isArray(candidate.pokemonTypes) ||
    !Array.isArray(candidate.megaPokemon) ||
    !candidate.effectiveness ||
    typeof candidate.effectiveness !== "object" ||
    !candidate.weatherBoosts ||
    typeof candidate.weatherBoosts !== "object"
  ) {
    return null;
  }
  return candidate as SupplementCache;
}

function isFresh(cache: SupplementCache | null, now = Date.now()): boolean {
  if (!cache) return false;
  const checkedAt = Date.parse(cache.checkedAt);
  return Number.isFinite(checkedAt) && now - checkedAt < CACHE_TTL_MS;
}

async function readCache(): Promise<SupplementCache | null> {
  if (memoryCache) return memoryCache;
  try {
    const parsed = validateCache(JSON.parse(await fs.readFile(cachePath(), "utf8")));
    if (parsed) memoryCache = parsed;
    return parsed;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || error instanceof SyntaxError) return null;
    return null;
  }
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "LEIGHPOGO raid-detail-cache",
      },
    });
    if (!response.ok) throw new Error(`PoGoAPI request failed with ${response.status}.`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function refreshCache(): Promise<SupplementCache> {
  const [pokemonTypes, megaPokemon, effectiveness, weatherBoosts] = await Promise.all([
    fetchJson(POKEMON_TYPES_URL),
    fetchJson(MEGA_POKEMON_URL),
    fetchJson(TYPE_EFFECTIVENESS_URL),
    fetchJson(WEATHER_BOOSTS_URL),
  ]);

  if (
    !Array.isArray(pokemonTypes) ||
    !Array.isArray(megaPokemon) ||
    !effectiveness ||
    typeof effectiveness !== "object" ||
    Array.isArray(effectiveness) ||
    !weatherBoosts ||
    typeof weatherBoosts !== "object" ||
    Array.isArray(weatherBoosts)
  ) {
    throw new Error("PoGoAPI returned invalid raid detail data.");
  }

  const cache: SupplementCache = {
    version: CACHE_VERSION,
    checkedAt: new Date().toISOString(),
    pokemonTypes: pokemonTypes as PokemonTypeRecord[],
    megaPokemon: megaPokemon as MegaPokemonRecord[],
    effectiveness: effectiveness as TypeEffectiveness,
    weatherBoosts: weatherBoosts as WeatherBoosts,
  };

  memoryCache = cache;
  const filePath = cachePath();
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(temporaryPath, `${JSON.stringify(cache)}\n`, "utf8");
    await fs.rename(temporaryPath, filePath);
  } catch (error) {
    console.error("Unable to persist raid detail cache", error);
    await fs.unlink(temporaryPath).catch(() => undefined);
  }
  return cache;
}

async function getSupplementData(): Promise<SupplementCache> {
  const existing = await readCache();
  if (isFresh(existing)) return existing as SupplementCache;
  if (!refreshPromise) {
    refreshPromise = refreshCache().finally(() => {
      refreshPromise = null;
    });
  }
  try {
    return await refreshPromise;
  } catch (error) {
    if (existing) {
      console.error("Unable to refresh raid detail data; using stale cache", error);
      return existing;
    }
    throw error;
  }
}

function itemBossParts(value: string): string[] {
  return value
    .replace(/\s+(?:and|&)\s+/gi, ",")
    .replace(/\s*\/\s*/g, ",")
    .split(",")
    .map((part) => normaliseBossName(part))
    .filter((part): part is string => Boolean(part));
}

function bossAliases(boss: PogoApiRaidBossCp): string[] {
  const form = normaliseBossName(boss.form);
  const name = normaliseBossName(boss.name);
  return Array.from(new Set([
    name,
    form && form !== "normal" ? `${form} ${name}` : "",
    form && form !== "normal" ? `${name} ${form}` : "",
  ].filter(Boolean).map(normaliseBossName)));
}

function categoryScore(category: RaidCategory, boss: PogoApiRaidBossCp): number {
  const tier = String(boss.tier ?? "").toLowerCase();
  const form = String(boss.form ?? "").toLowerCase();
  const name = String(boss.name ?? "").toLowerCase();
  const isMega = tier.includes("mega") || form.includes("mega") || name.startsWith("mega ");
  const isShadow = form.includes("shadow") || name.startsWith("shadow ");
  if (category === "mega") return isMega ? 30 : -10;
  if (category === "shadow") return isShadow ? 30 : isMega ? -20 : 0;
  return isMega || isShadow ? -20 : 10;
}

function matchBossPart(
  category: RaidCategory,
  part: string,
  bosses: PogoApiRaidBossCp[],
): PogoApiRaidBossCp | null {
  const ranked = bosses
    .map((boss, index) => {
      const nameScore = bossAliases(boss).reduce((best, alias) => {
        if (alias === part) return Math.max(best, 100);
        if (alias.length >= 4 && part.includes(alias)) return Math.max(best, 60);
        if (part.length >= 4 && alias.includes(part)) return Math.max(best, 50);
        return best;
      }, -1);
      return { boss, index, nameScore, total: nameScore + categoryScore(category, boss) };
    })
    .filter((entry) => entry.nameScore >= 0)
    .sort((a, b) => b.total - a.total || b.nameScore - a.nameScore || a.index - b.index);
  return ranked[0]?.boss ?? null;
}

export function matchRaidBossRecords(
  item: RaidBossTickerItem,
  bosses: PogoApiRaidBossCp[],
): PogoApiRaidBossCp[] {
  return Array.from(new Map(
    itemBossParts(item.boss)
      .map((part) => matchBossPart(item.category, part, bosses))
      .filter((boss): boss is PogoApiRaidBossCp => Boolean(boss))
      .map((boss) => [`${normaliseBossName(boss.name)}|${normaliseBossName(boss.form)}|${boss.tier}`, boss]),
  ).values());
}

function typeRecordScore(name: string, form: string, recordName: string, recordForm?: string): number {
  const targetName = normaliseBossName(name);
  const targetForm = normaliseBossName(form);
  const candidateName = normaliseBossName(recordName);
  const candidateForm = normaliseBossName(recordForm ?? "normal");
  if (targetName !== candidateName) return -1;
  if (targetForm === candidateForm) return 100;
  if (!targetForm || targetForm === "normal") return candidateForm === "normal" ? 90 : 20;
  return candidateForm.includes(targetForm) || targetForm.includes(candidateForm) ? 70 : 10;
}

function findTypes(
  category: RaidCategory,
  item: RaidBossTickerItem,
  boss: PogoApiRaidBossCp,
  supplement: SupplementCache,
): { types: string[]; pokemonId: number | null; displayName: string } {
  if (category === "mega") {
    const itemName = normaliseBossName(`mega ${item.boss}`);
    const mega = supplement.megaPokemon
      .map((record) => ({
        record,
        score: Math.max(
          normaliseBossName(record.mega_name) === itemName ? 120 : -1,
          typeRecordScore(boss.name, boss.form, record.pokemon_name, record.form),
        ),
      }))
      .filter((entry) => entry.score >= 0)
      .sort((a, b) => b.score - a.score)[0]?.record;
    if (mega) {
      return {
        types: validStringArray(mega.type),
        pokemonId: Number.isInteger(mega.pokemon_id) ? mega.pokemon_id : null,
        displayName: mega.mega_name || `Mega ${boss.name}`,
      };
    }
  }

  const record = supplement.pokemonTypes
    .map((entry) => ({
      entry,
      score: typeRecordScore(boss.name, boss.form, entry.pokemon_name, entry.form),
    }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score)[0]?.entry;

  const baseName = boss.form && normaliseBossName(boss.form) !== "normal"
    ? `${String(boss.form).replace(/_/g, " ")} ${boss.name}`
    : boss.name;
  const displayName = category === "shadow" && !/^shadow\b/i.test(baseName)
    ? `Shadow ${baseName}`
    : baseName;

  return {
    types: validStringArray(record?.type),
    pokemonId: Number.isInteger(record?.pokemon_id) ? Number(record?.pokemon_id) : null,
    displayName,
  };
}

export function calculateTypeMatchups(
  defendingTypes: string[],
  effectiveness: TypeEffectiveness,
): { weaknesses: RaidTypeMatchup[]; resistances: RaidTypeMatchup[] } {
  const results = Object.keys(effectiveness).map((attackingType) => {
    const multiplier = defendingTypes.reduce((total, defendingType) => {
      const raw = effectiveness[attackingType]?.[defendingType];
      const value = Number(raw ?? 1);
      return total * (Number.isFinite(value) ? value : 1);
    }, 1);
    return { type: attackingType, multiplier: Number(multiplier.toFixed(6)) };
  });

  return {
    weaknesses: results
      .filter((entry) => entry.multiplier > 1.000001)
      .sort((a, b) => b.multiplier - a.multiplier || a.type.localeCompare(b.type)),
    resistances: results
      .filter((entry) => entry.multiplier < 0.999999)
      .sort((a, b) => a.multiplier - b.multiplier || a.type.localeCompare(b.type)),
  };
}

function boostedWeatherForTypes(types: string[], weatherBoosts: WeatherBoosts): string[] {
  return Object.entries(weatherBoosts)
    .filter(([, boostedTypes]) => validStringArray(boostedTypes).some((type) => types.includes(type)))
    .map(([weather]) => weather)
    .sort();
}

export function raidBossProfileKey(
  category: RaidCategory,
  boss: PogoApiRaidBossCp,
): string {
  return [category, normaliseBossName(boss.name), normaliseBossName(boss.form), String(boss.tier)].join("|");
}

export async function getCurrentRaidBossProfiles(
  item: RaidBossTickerItem,
): Promise<RaidBossProfileData[]> {
  const [raidData, supplement] = await Promise.all([
    getRaidBossCpData(),
    getSupplementData(),
  ]);

  return matchRaidBossRecords(item, raidData.bosses).map((boss) => {
    const { types, pokemonId, displayName } = findTypes(item.category, item, boss, supplement);
    const { weaknesses, resistances } = calculateTypeMatchups(types, supplement.effectiveness);
    return {
      key: raidBossProfileKey(item.category, boss),
      category: item.category,
      name: displayName,
      pokemonId,
      form: boss.form || null,
      tier: boss.tier || null,
      types,
      weaknesses,
      resistances,
      boostedWeather: boostedWeatherForTypes(types, supplement.weatherBoosts),
      maxUnboostedCp: boss.maxUnboostedCp,
      maxBoostedCp: boss.maxBoostedCp,
      possibleShiny: boss.possibleShiny,
      refreshedAt: new Date().toISOString(),
    };
  });
}
