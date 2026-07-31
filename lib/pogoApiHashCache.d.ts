export interface PogoApiHashEntry {
  api_filename: string;
  full_path: string;
  hash_md5: string | null;
  hash_sha1: string | null;
  hash_sha256: string | null;
}

export interface PogoApiHashManifest {
  version: number;
  checkedAt: string;
  hashes: Record<string, PogoApiHashEntry>;
  stale: boolean;
  warning: string | null;
}

export interface PogoApiFileHash {
  filename: string;
  fullPath: string;
  hash: string;
  checkedAt: string;
  stale: boolean;
  warning: string | null;
}

export interface PogoApiHashOptions {
  allowStale?: boolean;
  cachePath?: string;
  forceRefresh?: boolean;
  strictWrite?: boolean;
}

export const API_HASHES_URL: string;
export const HASH_CACHE_TTL_MS: number;

export function getPogoApiFileHash(
  filename: string,
  options?: PogoApiHashOptions,
): Promise<PogoApiFileHash>;

export function getPogoApiHashManifest(
  options?: PogoApiHashOptions,
): Promise<PogoApiHashManifest>;

export function isHashCacheFresh(
  cache: { checkedAt?: string | null } | null | undefined,
  maxAgeMs?: number,
  now?: number,
): boolean;

export function normaliseHashManifest(
  payload: unknown,
): Record<string, PogoApiHashEntry>;

export function selectPreferredHash(
  entry: Partial<PogoApiHashEntry> | null | undefined,
): string | null;
