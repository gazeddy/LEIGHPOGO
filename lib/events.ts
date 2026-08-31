export const EVENT_DATA_CREDITS = {
  leekDuckUrl: "https://leekduck.com/",
  scrapedDuckUrl: "https://github.com/bigfoott/ScrapedDuck",
};

export interface PokemonGoEventPokemon {
  name: string;
  image: string | null;
  canBeShiny: boolean | null;
}

export interface PokemonGoRaidScheduleBoss {
  name: string;
  image: string | null;
  canBeShiny: boolean | null;
  raidType: string | null;
}

export interface PokemonGoRaidScheduleEntry {
  date: string;
  time: string | null;
  label: string | null;
  bosses: PokemonGoRaidScheduleBoss[];
}

export interface PokemonGoEventSummary {
  eventID: string;
  name: string;
  eventType: string;
  heading: string;
  link: string | null;
  image: string | null;
  start: string;
  end: string;
  tags?: string[];
  description?: string | null;
  campfireUrl?: string | null;
  wildSpawns?: PokemonGoEventPokemon[];
  featuredRaids?: PokemonGoEventPokemon[];
  bonuses?: string[];
  raidSchedule?: PokemonGoRaidScheduleEntry[];
  source?: "feed" | "local";
}

export function getEventDestination(
  event: Pick<PokemonGoEventSummary, "eventID">,
): string {
  return `/events?event=${encodeURIComponent(event.eventID)}`;
}

export interface EventsPageData {
  events: PokemonGoEventSummary[];
  fetchedAt: string;
  isStale: boolean;
  warning: string | null;
}

export interface EventTickerItem {
  eventID: string;
  name: string;
  heading: string;
  start: string;
  end: string;
  guideSlug: string | null;
  guideTitle: string | null;
  eventUrl: string | null;
  eventUrlLabel: string | null;
}

export type RaidCategory = "five-star" | "shadow" | "mega";

export interface RaidBossCatchCp {
  boss: string;
  maxUnboostedCp: number;
  maxBoostedCp: number;
  possibleShiny: boolean;
}

export interface RaidBossTickerItem {
  eventID: string;
  category: RaidCategory;
  label: string;
  boss: string;
  start: string;
  end: string;
  link: string | null;
  state?: "current" | "next";
  catchCp?: RaidBossCatchCp[];
}

export interface RaidTypeMatchup {
  type: string;
  multiplier: number;
}

export interface RaidBossProfileData {
  key: string;
  category: RaidCategory;
  name: string;
  pokemonId: number | null;
  form: string | null;
  tier: string | null;
  types: string[];
  weaknesses: RaidTypeMatchup[];
  resistances: RaidTypeMatchup[];
  boostedWeather: string[];
  maxUnboostedCp: number | null;
  maxBoostedCp: number | null;
  possibleShiny: boolean | null;
  refreshedAt: string | null;
}

export interface RaidRotationData {
  eventID: string;
  category: RaidCategory;
  label: string;
  boss: string;
  start: string;
  end: string;
  active: boolean;
  sourceUrl: string | null;
  imageUrl: string | null;
  anchor: string;
  bosses: RaidBossProfileData[];
}

export interface RaidCategoryData {
  category: RaidCategory;
  label: string;
  rotations: RaidRotationData[];
  next: RaidBossTickerItem | null;
}

export interface RaidToolsData {
  categories: RaidCategoryData[];
  tickerItems: RaidBossTickerItem[];
  fetchedAt: string;
  warning: string | null;
}
