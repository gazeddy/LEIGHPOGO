import fs from "node:fs/promises";
import path from "node:path";
import {
  readGymState,
  writeGymState,
  type GymState,
} from "./gyms";

const GYM_BACKUP_DIRECTORY =
  process.env.GYM_BACKUPS_DIRECTORY?.trim() ||
  path.join(process.cwd(), "data", "gym-state-backups");

export interface GymStateBackupInfo {
  fileName: string;
  createdAt: string;
}

interface RollbackResult {
  state: GymState;
  restoredFile: string;
  recoveryBackupFile: string;
}

function ukTimestampParts(date: Date): Record<string, string> {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
}

function backupBaseName(date: Date, reason: string): string {
  const parts = ukTimestampParts(date);
  const safeReason = reason
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "state";

  const milliseconds = String(date.getMilliseconds()).padStart(3, "0");

  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}-${parts.minute}-${parts.second}-${milliseconds} - ${safeReason}.json`;
}

async function backupFiles(): Promise<string[]> {
  try {
    const entries = await fs.readdir(GYM_BACKUP_DIRECTORY, {
      withFileTypes: true,
    });

    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => entry.name)
      .sort()
      .reverse();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

function parseBackupState(source: string, fileName: string): GymState {
  const parsed = JSON.parse(source) as Partial<GymState>;

  if (!Array.isArray(parsed.gyms)) {
    throw new Error(`Gym backup ${fileName} does not contain a valid gym list.`);
  }

  return {
    version: 1,
    importedAt:
      typeof parsed.importedAt === "string" ? parsed.importedAt : null,
    sourceFile: typeof parsed.sourceFile === "string" ? parsed.sourceFile : null,
    gyms: parsed.gyms,
    removalReports: Array.isArray(parsed.removalReports)
      ? parsed.removalReports
      : [],
  };
}

export async function backupGymState(
  state: GymState,
  reason: string,
  createdAt = new Date(),
): Promise<string> {
  await fs.mkdir(GYM_BACKUP_DIRECTORY, { recursive: true });

  const baseName = backupBaseName(createdAt, reason);
  let fileName = baseName;
  let suffix = 2;

  while (true) {
    const destination = path.join(GYM_BACKUP_DIRECTORY, fileName);

    try {
      await fs.writeFile(
        destination,
        `${JSON.stringify(state, null, 2)}\n`,
        { encoding: "utf8", flag: "wx" },
      );
      return fileName;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }

      fileName = baseName.replace(/\.json$/, `-${suffix}.json`);
      suffix += 1;
    }
  }
}

export async function latestGymStateBackup(): Promise<GymStateBackupInfo | null> {
  const [fileName] = await backupFiles();

  if (!fileName) {
    return null;
  }

  const stats = await fs.stat(path.join(GYM_BACKUP_DIRECTORY, fileName));

  return {
    fileName,
    createdAt: stats.mtime.toISOString(),
  };
}

export async function clearAllNewGymFlags(): Promise<{
  state: GymState;
  cleared: number;
  backupFile: string | null;
}> {
  const state = await readGymState();
  const cleared = state.gyms.filter((gym) => gym.firstSeenAt !== null).length;

  if (cleared === 0) {
    return { state, cleared, backupFile: null };
  }

  const backupFile = await backupGymState(state, "before-clear-new-flags");
  const nextState: GymState = {
    ...state,
    gyms: state.gyms.map((gym) => ({
      ...gym,
      firstSeenAt: null,
    })),
  };

  await writeGymState(nextState);

  return { state: nextState, cleared, backupFile };
}

export async function rollbackLatestGymState(): Promise<RollbackResult | null> {
  const latest = await latestGymStateBackup();

  if (!latest) {
    return null;
  }

  const source = await fs.readFile(
    path.join(GYM_BACKUP_DIRECTORY, latest.fileName),
    "utf8",
  );
  const restoredState = parseBackupState(source, latest.fileName);
  const currentState = await readGymState();
  const recoveryBackupFile = await backupGymState(
    currentState,
    "before-rollback",
  );

  await writeGymState(restoredState);

  return {
    state: restoredState,
    restoredFile: latest.fileName,
    recoveryBackupFile,
  };
}
