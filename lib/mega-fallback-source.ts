import { normaliseBossName } from "./raidBossCpCache";
import type {
  RaidBossProfileData,
  RaidBossTickerItem,
  RaidTypeMatchup,
} from "./events";

const CACHE_TTL_MS = 15 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15_000;
const POKEMON_TYPES_URL = "https://pogoapi.net/api/v1/pokemon_types.json";
const POKEMON_STATS_URL = "https://pogoapi.net/api/v1/pokemon_stats.json";
const CP_MULTIPLIER_URL = "https://pogoapi.net/api/v1/cp_multiplier.json";
const MEGA_POKEMON_URL = "https://pogoapi.net/api/v1/mega_pokemon.json";
const TYPE_EFFECTIVENESS_URL = "https://pogoapi.net/api/v1/type_effectiveness.json";
const WEATHER_BOOSTS_URL = "https://pogoapi.net/api/v1/weather_boosts.json";

export interface MegaFallbackPokemonTypeRecord {
  pokemon_id: number;
  pokemon_name: string;
  form?: string;
  type: string[];
}

export interface MegaFallbackPokemonStatsRecord {
  pokemon_id: number;
  pokemon_name: string;
  form?: string;
  base_attack: number;
  base_defense: number;
  base_stamina: number;
}

export interface MegaFallbackCpMultiplierRecord {
  level: number;
  multiplier: number;
}

export interface MegaFallbackMegaRecord {
  pokemon_id: number;
  pokemon_name: string;
  mega_name: string;
  form?: string;
  type: string[];
}

type TypeEffectiveness = Record<string, Record<string, string | number>>;
type WeatherBoosts = Record<string, string[]>;

export interface MegaFallbackSourceData {
  checkedAt: string;
  pokemonTypes: MegaFallbackPokemonTypeRecord[];
  pokemonStats: MegaFallbackPokemonStatsRecord[];
  cpMultipliers: MegaFallbackCpMultiplierRecord[];
  megaPokemon: MegaFallbackMegaRecord[];
  effectiveness: TypeEffectiveness;
  weatherBoosts: WeatherBoosts;
}

let memoryCache: MegaFallbackSourceData | null = null;
let refreshPromise: Promise<MegaFallbackSourceData> | null = null;

function validStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim()))
    : [];
}

function finiteNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "LEIGHPOGO mega-fallback-source",
      },
    });
    if (!response.ok) throw new Error(`PoGoAPI request failed with ${response.status}.`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function sourceIsFresh(source: MegaFallbackSourceData | null, now = Date.now()): boolean {
  if (!source) return false;
  const checkedAt = Date.parse(source.checkedAt);
  return Number.isFinite(checkedAt) && now - checkedAt < CACHE_TTL_MS;
}

async function refreshSourceData(): Promise<MegaFallbackSourceData> {
  const [pokemonTypes, pokemonStats, cpMultipliers, megaPokemon, effectiveness, weatherBoosts] =
    await Promise.all([
      fetchJson(POKEMON_TYPES_URL),
      fetchJson(POKEMON_STATS_URL),
      fetchJson(CP_MULTIPLIER_URL),
      fetchJson(MEGA_POKEMON_URL),
      fetchJson(TYPE_EFFECTIVENESS_URL),
      fetchJson(WEATHER_BOOSTS_URL),
    ]);

  if (
    !Array.isArray(pokemonTypes) ||
    !Array.isArray(pokemonStats) ||
    !Array.isArray(cpMultipliers) ||
    !Array.isArray(megaPokemon) ||
    !effectiveness ||
    typeof effectiveness !== "object" ||
    Array.isArray(effectiveness) ||
    !weatherBoosts ||
    typeof weatherBoosts !== "object" ||
    Array.isArray(weatherBoosts)
  ) {
    throw new Error("PoGoAPI returned invalid Mega fallback data.");
  }

  const source: MegaFallbackSourceData = {
    checkedAt: new Date().toISOString(),
    pokemonTypes: pokemonTypes as MegaFallbackPokemonTypeRecord[],
    pokemonStats: pokemonStats as MegaFallbackPokemonStatsRecord[],
    cpMultipliers: cpMultipliers as MegaFallbackCpMultiplierRecord[],
    megaPokemon: megaPokemon as MegaFallbackMegaRecord[],
    effectiveness: effectiveness as TypeEffectiveness,
    weatherBoosts: weatherBoosts as WeatherBoosts,
  };

  memoryCache = source;
  return source;
}

async function getSourceData(): Promise<MegaFallbackSourceData> {
  if (sourceIsFresh(memoryCache)) return memoryCache as MegaFallbackSourceData;
  if (!refreshPromise) {
    refreshPromise = refreshSourceData().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

function itemBossParts(value: string): string[] {
  return value
    .replace(/\s+(?:and|&)\s+/gi, ",")
    .replace(/\s*\/\s*/g, ",")
    .split(",")
    .map((part) => normaliseBossName(part))
    .filter((part): part is string => Boolean(part));
}

function profileCoversPart(profile: RaidBossProfileData, part: string): boolean {
  const name = normaliseBossName(profile.name);
  return name === part || name.includes(part) || part.includes(name);
}

function recordAliases(record: MegaFallbackPokemonTypeRecord): string[] {
  const name = normaliseBossName(record.pokemon_name);
  const form = normaliseBossName(record.form ?? "normal");
  return Array.from(new Set([
    name,
    form && form !== "normal" ? `${form} ${name}` : "",
    form && form !== "normal" ? `${name} ${form}` : "",
  ].filter(Boolean).map(normaliseBossName)));
}

function matchBasePokemon(
  part: string,
  records: MegaFallbackPokemonTypeRecord[],
): MegaFallbackPokemonTypeRecord | null {
  return records
    .map((record, index) => {
      const form = normaliseBossName(record.form ?? "normal");
      const nameScore = recordAliases(record).reduce((best, alias) => {
        if (alias === part) return Math.max(best, 100);
        if (alias.length >= 4 && part.includes(alias)) return Math.max(best, 60);
        if (part.length >= 4 && alias.includes(part)) return Math.max(best, 50);
        return best;
      }, -1);
      const formScore = form === "normal" ? 20 : 0;
      return { record, index, nameScore, total: nameScore + formScore };
    })
    .filter((entry) => entry.nameScore >= 0)
    .sort((a, b) => b.total - a.total || b.nameScore - a.nameScore || a.index - b.index)[0]?.record ?? null;
}

function megaAliases(record: MegaFallbackMegaRecord): string[] {
  const form = normaliseBossName(record.form ?? "normal");
  return Array.from(new Set([
    record.mega_name,
    record.pokemon_name,
    form && form !== "normal" ? `${record.pokemon_name} ${record.form}` : "",
    form && form !== "normal" ? `${record.form} ${record.pokemon_name}` : "",
  ].filter(Boolean).map(normaliseBossName)));
}

function matchMega(
  part: string,
  records: MegaFallbackMegaRecord[],
): MegaFallbackMegaRecord | null {
  return records
    .map((record, index) => ({
      record,
      index,
      score: megaAliases(record).reduce((best, alias) => {
        if (alias === part) return Math.max(best, 100);
        if (alias.length >= 4 && part.includes(alias)) return Math.max(best, 60);
        if (part.length >= 4 && alias.includes(part)) return Math.max(best, 50);
        return best;
      }, -1),
    }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)[0]?.record ?? null;
}

function statsScore(
  pokemon: MegaFallbackPokemonTypeRecord,
  stats: MegaFallbackPokemonStatsRecord,
): number {
  const idMatch = Number(stats.pokemon_id) === Number(pokemon.pokemon_id);
  const nameMatch = normaliseBossName(stats.pokemon_name) === normaliseBossName(pokemon.pokemon_name);
  if (!idMatch && !nameMatch) return -1;

  const targetForm = normaliseBossName(pokemon.form ?? "normal");
  const statsForm = normaliseBossName(stats.form ?? "normal");
  const formScore = targetForm === statsForm ? 80 : statsForm === "normal" ? 50 : 0;
  return (idMatch ? 100 : 0) + (nameMatch ? 40 : 0) + formScore;
}

function findStats(
  pokemon: MegaFallbackPokemonTypeRecord,
  records: MegaFallbackPokemonStatsRecord[],
): MegaFallbackPokemonStatsRecord | null {
  return records
    .map((stats, index) => ({ stats, index, score: statsScore(pokemon, stats) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)[0]?.stats ?? null;
}

function cpMultiplier(records: MegaFallbackCpMultiplierRecord[], level: number): number | null {
  const record = records.find((entry) => Math.abs(Number(entry.level) - level) < 0.000001);
  return finiteNumber(record?.multiplier);
}

function perfectCp(stats: MegaFallbackPokemonStatsRecord | null, multiplier: number | null): number | null {
  if (!stats || multiplier === null || multiplier <= 0) return null;
  const attack = finiteNumber(stats.base_attack);
  const defense = finiteNumber(stats.base_defense);
  const stamina = finiteNumber(stats.base_stamina);
  if (attack === null || defense === null || stamina === null) return null;

  return Math.max(
    10,
    Math.floor(
      ((attack + 15) * Math.sqrt(defense + 15) * Math.sqrt(stamina + 15) * multiplier ** 2) /
        10,
    ),
  );
}

function calculateTypeMatchups(
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

function boostedWeather(types: string[], weatherBoosts: WeatherBoosts): string[] {
  return Object.entries(weatherBoosts)
    .filter(([, boostedTypes]) => validStringArray(boostedTypes).some((type) => types.includes(type)))
    .map(([weather]) => weather)
    .sort();
}

function fallbackProfile(
  part: string,
  source: MegaFallbackSourceData,
  refreshedAt: string,
): RaidBossProfileData | null {
  const base = matchBasePokemon(part, source.pokemonTypes);
  if (!base) return null;

  const mega = matchMega(part, source.megaPokemon);
  const types = validStringArray(mega?.type ?? base.type);
  const stats = findStats(base, source.pokemonStats);
  const { weaknesses, resistances } = calculateTypeMatchups(types, source.effectiveness);
  const provisional = !mega;

  return {
    key: provisional
      ? `mega-provisional|${normaliseBossName(base.pokemon_name)}|base`
      : `mega-fallback|${normaliseBossName(mega.mega_name)}|${normaliseBossName(mega.form ?? "normal")}|official`,
    category: "mega",
    name: base.pokemon_name,
    pokemonId: Number.isInteger(base.pokemon_id) ? base.pokemon_id : null,
    form: mega?.form ?? base.form ?? null,
    tier: provisional ? "mega-provisional" : "mega",
    types,
    weaknesses,
    resistances,
    boostedWeather: boostedWeather(types, source.weatherBoosts),
    maxUnboostedCp: perfectCp(stats, cpMultiplier(source.cpMultipliers, 20)),
    maxBoostedCp: perfectCp(stats, cpMultiplier(source.cpMultipliers, 25)),
    possibleShiny: null,
    refreshedAt,
  };
}

export function buildMegaFallbackProfiles(
  item: RaidBossTickerItem,
  existingProfiles: RaidBossProfileData[],
  source: MegaFallbackSourceData,
  refreshedAt: string = new Date().toISOString(),
): RaidBossProfileData[] {
  if (item.category !== "mega") return [];

  return itemBossParts(item.boss)
    .filter((part) => !existingProfiles.some((profile) => profileCoversPart(profile, part)))
    .map((part) => fallbackProfile(part, source, refreshedAt))
    .filter((profile): profile is RaidBossProfileData => profile !== null);
}

export async function getMegaFallbackProfiles(
  item: RaidBossTickerItem,
  existingProfiles: RaidBossProfileData[],
): Promise<RaidBossProfileData[]> {
  if (item.category !== "mega") return [];
  return buildMegaFallbackProfiles(item, existingProfiles, await getSourceData());
}

export function isProvisionalMegaProfileKey(key: string): boolean {
  return key.startsWith("mega-provisional|");
}
