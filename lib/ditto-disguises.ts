export interface DittoDisguise {
  id: number;
  name: string;
}

export interface DittoSeason {
  eventID: string;
  name: string;
  start: string;
  end: string;
}

export interface DittoDisguisePayload {
  disguises: DittoDisguise[];
  season: DittoSeason | null;
  fetchedAt: string;
  isStale: boolean;
  warning: string | null;
}

export function normaliseDittoDisguises(payload: unknown): DittoDisguise[] {
  const values = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object"
      ? Object.values(payload as Record<string, unknown>)
      : [];
  const disguises = values
    .map((value): DittoDisguise | null => {
      if (!value || typeof value !== "object") {
        return null;
      }

      const candidate = value as Record<string, unknown>;
      const id = Number(candidate.id);
      const name =
        typeof candidate.name === "string" ? candidate.name.trim() : "";

      if (!Number.isInteger(id) || id <= 0 || !name) {
        return null;
      }

      return { id, name };
    })
    .filter((item): item is DittoDisguise => item !== null)
    .sort((left, right) => left.id - right.id);

  return Array.from(
    new Map(disguises.map((disguise) => [disguise.id, disguise])).values(),
  );
}

export function isDittoCacheForHash(
  cachedHash: string | null | undefined,
  currentHash: string | null | undefined,
): boolean {
  return Boolean(cachedHash && currentHash && cachedHash === currentHash);
}
