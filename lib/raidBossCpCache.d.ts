import type {
  RaidBossCatchCp,
  RaidBossTickerItem,
} from "./events";

export interface PogoApiRaidBossCp {
  name: string;
  form: string;
  tier: string;
  maxUnboostedCp: number;
  maxBoostedCp: number;
}

export interface RaidBossCpCacheData {
  checkedAt: string;
  sourceHash: string | null;
  bosses: PogoApiRaidBossCp[];
  stale: boolean;
}

export interface RaidBossCpCacheOptions {
  allowStale?: boolean;
  cachePath?: string;
  forceRefresh?: boolean;
  strictWrite?: boolean;
  touchWhenUnchanged?: boolean;
}

export const CACHE_TTL_MS: number;

export function attachRaidBossCp(
  items: RaidBossTickerItem[],
  bosses: PogoApiRaidBossCp[],
): RaidBossTickerItem[];

export function extractCurrentRaidBosses(
  payload: unknown,
): PogoApiRaidBossCp[];

export function findRaidBossCpMatches(
  item: RaidBossTickerItem,
  bosses: PogoApiRaidBossCp[],
): RaidBossCatchCp[];

export function getRaidBossCpData(
  options?: RaidBossCpCacheOptions,
): Promise<RaidBossCpCacheData>;

export function isCacheFresh(
  cache: { checkedAt?: string | null } | null | undefined,
  maxAgeMs?: number,
  now?: number,
): boolean;

export function normaliseBossName(value: unknown): string;
