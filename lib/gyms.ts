import fs from "node:fs/promises";
import path from "node:path";

export const NEW_GYM_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const GYM_DATA_FILE =
  process.env.GYM_DATA_FILE?.trim() || path.join(process.cwd(), "data", "gyms.json");

export interface GymRecord {
  id: string;
  name: string;
  alias: string | null;
  url: string | null;
  lat: number;
  lon: number;
  exRaidEligible: boolean;
  firstSeenAt: string | null;
}

export interface GymState {
  version: 1;
  importedAt: string | null;
  sourceFile: string | null;
  gyms: GymRecord[];
}

export interface GymImportSummary {
  total: number;
  added: number;
  updated: number;
  removed: number;
  unchanged: number;
  importedAt: string;
  sourceFile: string;
}

const EMPTY_STATE: GymState = {
  version: 1,
  importedAt: null,
  sourceFile: null,
  gyms: [],
};

function validGym(value: unknown): value is GymRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const gym = value as Partial<GymRecord>;

  return (
    typeof gym.id === "string" &&
    gym.id.length > 0 &&
    typeof gym.name === "string" &&
    gym.name.length > 0 &&
    typeof gym.lat === "number" &&
    Number.isFinite(gym.lat) &&
    gym.lat >= -90 &&
    gym.lat <= 90 &&
    typeof gym.lon === "number" &&
    Number.isFinite(gym.lon) &&
    gym.lon >= -180 &&
    gym.lon <= 180
  );
}

export async function readGymState(): Promise<GymState> {
  try {
    const source = await fs.readFile(GYM_DATA_FILE, "utf8");
    const parsed = JSON.parse(source) as Partial<GymState>;

    if (!Array.isArray(parsed.gyms)) {
      return { ...EMPTY_STATE };
    }

    return {
      version: 1,
      importedAt:
        typeof parsed.importedAt === "string" ? parsed.importedAt : null,
      sourceFile: typeof parsed.sourceFile === "string" ? parsed.sourceFile : null,
      gyms: parsed.gyms.filter(validGym).map((gym) => ({
        ...gym,
        alias:
          typeof gym.alias === "string" && gym.alias.trim()
            ? gym.alias.trim()
            : null,
        url: typeof gym.url === "string" && gym.url.trim() ? gym.url.trim() : null,
        exRaidEligible: gym.exRaidEligible === true,
        firstSeenAt:
          typeof gym.firstSeenAt === "string" && gym.firstSeenAt.trim()
            ? gym.firstSeenAt
            : null,
      })),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { ...EMPTY_STATE };
    }

    console.error("Unable to read gym data", error);
    return { ...EMPTY_STATE };
  }
}

export async function writeGymState(state: GymState): Promise<void> {
  const directory = path.dirname(GYM_DATA_FILE);
  const temporaryFile = `${GYM_DATA_FILE}.tmp-${process.pid}-${Date.now()}`;

  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(temporaryFile, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await fs.rename(temporaryFile, GYM_DATA_FILE);
}

export function getGymDisplayName(gym: Pick<GymRecord, "name" | "alias">): string {
  return gym.alias || gym.name;
}

export function gymIsNew(gym: GymRecord, now = Date.now()): boolean {
  if (!gym.firstSeenAt) {
    return false;
  }

  const firstSeen = Date.parse(gym.firstSeenAt);
  return Number.isFinite(firstSeen) && now - firstSeen >= 0 && now - firstSeen < NEW_GYM_WINDOW_MS;
}

export function getNewGymOpacity(gym: GymRecord, now = Date.now()): number {
  if (!gymIsNew(gym, now) || !gym.firstSeenAt) {
    return 0;
  }

  const age = now - Date.parse(gym.firstSeenAt);
  return Math.max(0, Math.min(1, 1 - age / NEW_GYM_WINDOW_MS));
}

export function sortGyms(gyms: GymRecord[]): GymRecord[] {
  return [...gyms].sort((left, right) =>
    getGymDisplayName(left).localeCompare(getGymDisplayName(right), "en-GB"),
  );
}

export function cleanAlias(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const alias = value.trim().replace(/\s+/g, " ");

  if (!alias) {
    return null;
  }

  if (alias.length > 100) {
    throw new Error("Gym aliases must be 100 characters or fewer.");
  }

  return alias;
}
