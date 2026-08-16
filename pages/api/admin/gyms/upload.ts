import fs from "node:fs/promises";
import path from "node:path";
import type { NextApiRequest, NextApiResponse } from "next";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth/next";
import { parse } from "csv-parse/sync";
import { backupGymState } from "../../../../lib/gym-backups";
import { isCommunityGym } from "../../../../lib/communityGyms";
import {
  approvedRemovalGymIds,
  readGymState,
  writeGymState,
  type GymImportSummary,
  type GymRecord,
} from "../../../../lib/gyms";
import { authOptions } from "../../auth/[...nextauth]";

const MAX_CSV_SIZE = 5 * 1024 * 1024;
const IMPORT_DIRECTORY =
  process.env.GYM_IMPORTS_DIRECTORY?.trim() ||
  path.join(process.cwd(), "data", "gym-imports");

interface UploadBody {
  fileName?: unknown;
  dataUrl?: unknown;
}

interface CsvGymRow {
  id?: unknown;
  name?: unknown;
  url?: unknown;
  lat?: unknown;
  lon?: unknown;
  __typename?: unknown;
  ex_raid_eligible?: unknown;
  first_seen?: unknown;
}

type UploadResponse =
  | { message: string; summary: GymImportSummary }
  | { error: string };

function requiredText(value: unknown, field: string, row: number): string {
  const text = typeof value === "string" ? value.trim() : String(value ?? "").trim();

  if (!text) {
    throw new Error(`Row ${row}: ${field} is required.`);
  }

  return text;
}

function coordinate(value: unknown, field: "lat" | "lon", row: number): number {
  const number = Number(value);
  const minimum = field === "lat" ? -90 : -180;
  const maximum = field === "lat" ? 90 : 180;

  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw new Error(`Row ${row}: ${field} is not a valid coordinate.`);
  }

  return number;
}

function booleanValue(value: unknown): boolean {
  if (value === true || value === 1) {
    return true;
  }

  return ["true", "1", "yes"].includes(String(value ?? "").trim().toLowerCase());
}

function optionalDate(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : String(value ?? "").trim();

  if (!text) {
    return null;
  }

  const numeric = Number(text);
  let date: Date;

  if (Number.isFinite(numeric)) {
    let milliseconds = numeric;

    if (Math.abs(milliseconds) < 100_000_000_000) {
      milliseconds *= 1000;
    } else if (Math.abs(milliseconds) >= 100_000_000_000_000) {
      milliseconds /= 1000;
    }

    date = new Date(milliseconds);
  } else {
    date = new Date(text);
  }

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function optionalUrl(value: unknown): string | null {
  const url = typeof value === "string" ? value.trim() : "";

  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function decodeCsv(body: UploadBody): Buffer {
  if (typeof body.fileName !== "string" || !body.fileName.toLowerCase().endsWith(".csv")) {
    throw new Error("Choose a CSV file.");
  }

  if (typeof body.dataUrl !== "string") {
    throw new Error("CSV data is required.");
  }

  const match = body.dataUrl.match(/^data:[^;]*;base64,([A-Za-z0-9+/=]+)$/);

  if (!match) {
    throw new Error("The uploaded CSV data is invalid.");
  }

  const buffer = Buffer.from(match[1], "base64");

  if (buffer.length === 0 || buffer.length > MAX_CSV_SIZE) {
    throw new Error("Gym CSV files must be between 1 byte and 5 MB.");
  }

  return buffer;
}

function parseGyms(
  buffer: Buffer,
): Omit<GymRecord, "alias" | "markerEmoji">[] {
  let rows: CsvGymRow[];

  try {
    rows = parse(buffer, {
      bom: true,
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    }) as CsvGymRow[];
  } catch (error) {
    throw new Error(
      error instanceof Error ? `The CSV could not be parsed: ${error.message}` : "The CSV could not be parsed.",
    );
  }

  if (rows.length === 0) {
    throw new Error("The CSV does not contain any gym rows.");
  }

  if (rows.length > 10_000) {
    throw new Error("The CSV contains more than 10,000 rows.");
  }

  const gyms = rows
    .filter((row) => {
      const type = String(row.__typename ?? "Gym").trim().toLowerCase();
      return !type || type === "gym";
    })
    .map((row, index) => ({
      id: requiredText(row.id, "id", index + 2),
      name: requiredText(row.name, "name", index + 2),
      url: optionalUrl(row.url),
      lat: coordinate(row.lat, "lat", index + 2),
      lon: coordinate(row.lon, "lon", index + 2),
      exRaidEligible: booleanValue(row.ex_raid_eligible),
      firstSeenAt: optionalDate(row.first_seen),
    }));

  if (gyms.length === 0) {
    throw new Error("The CSV does not contain any Gym records.");
  }

  const ids = new Set<string>();

  for (const gym of gyms) {
    if (ids.has(gym.id)) {
      throw new Error(`The CSV contains a duplicate gym ID: ${gym.id}`);
    }
    ids.add(gym.id);
  }

  return gyms;
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

function uploadFileName(date: Date): string {
  const parts = ukTimestampParts(date);
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}-${parts.minute}-${parts.second} - gyms.csv`;
}

async function archiveCsv(buffer: Buffer, uploadedAt: Date): Promise<string> {
  await fs.mkdir(IMPORT_DIRECTORY, { recursive: true });

  const baseName = uploadFileName(uploadedAt);
  let fileName = baseName;
  let suffix = 2;

  while (true) {
    const destination = path.join(IMPORT_DIRECTORY, fileName);

    try {
      await fs.writeFile(destination, buffer, { flag: "wx" });
      return fileName;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }

      fileName = baseName.replace(/ - gyms\.csv$/, `-${suffix} - gyms.csv`);
      suffix += 1;
    }
  }
}

function sourceFieldsMatch(
  left: GymRecord,
  right: Omit<GymRecord, "alias" | "markerEmoji">,
): boolean {
  return (
    left.name === right.name &&
    left.url === right.url &&
    left.lat === right.lat &&
    left.lon === right.lon &&
    left.exRaidEligible === right.exRaidEligible
  );
}

function earliestDate(
  existingValue: string | null,
  importedValue: string | null,
): string | null {
  const existingTime = existingValue ? Date.parse(existingValue) : Number.NaN;
  const importedTime = importedValue ? Date.parse(importedValue) : Number.NaN;

  if (Number.isFinite(existingTime) && Number.isFinite(importedTime)) {
    return existingTime <= importedTime ? existingValue : importedValue;
  }

  if (Number.isFinite(existingTime)) {
    return existingValue;
  }

  if (Number.isFinite(importedTime)) {
    return importedValue;
  }

  return null;
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "8mb",
    },
  },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<UploadResponse>,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions as NextAuthOptions);

  if ((session?.user as { role?: string } | undefined)?.role !== "admin") {
    return res.status(403).json({ error: "Access denied" });
  }

  try {
    const buffer = decodeCsv(req.body as UploadBody);
    const parsedGyms = parseGyms(buffer);
    const previous = await readGymState();
    const suppressedGymIds = approvedRemovalGymIds(previous.removalReports);
    const importedGyms = parsedGyms.filter((gym) => !suppressedGymIds.has(gym.id));
    const previousImportedGyms = previous.gyms.filter((gym) => !isCommunityGym(gym));
    const communityGyms = previous.gyms.filter(isCommunityGym);
    const previousById = new Map(previousImportedGyms.map((gym) => [gym.id, gym]));
    const importedAtDate = new Date();
    const importedAt = importedAtDate.toISOString();
    const initialImport = previousImportedGyms.length === 0;
    let added = 0;
    let updated = 0;
    let unchanged = 0;

    const importedGymRecords: GymRecord[] = importedGyms.map((gym) => {
      const existing = previousById.get(gym.id);

      if (!existing) {
        added += initialImport ? 0 : 1;
        return {
          ...gym,
          alias: null,
          markerEmoji: null,
          firstSeenAt: gym.firstSeenAt ?? (initialImport ? null : importedAt),
        };
      }

      if (sourceFieldsMatch(existing, gym)) {
        unchanged += 1;
      } else {
        updated += 1;
      }

      return {
        ...gym,
        alias: existing.alias,
        markerEmoji: existing.markerEmoji,
        firstSeenAt: earliestDate(existing.firstSeenAt, gym.firstSeenAt),
      };
    });

    const importedIds = new Set(importedGymRecords.map((gym) => gym.id));
    const preservedCommunityGyms = communityGyms.filter(
      (gym) => !importedIds.has(gym.id) && !suppressedGymIds.has(gym.id),
    );
    const gyms = [...importedGymRecords, ...preservedCommunityGyms];
    const removed = previousImportedGyms.filter(
      (gym) => !importedIds.has(gym.id),
    ).length;
    const sourceFile = await archiveCsv(buffer, importedAtDate);

    await backupGymState(previous, "before-import", importedAtDate);
    await writeGymState({
      version: 1,
      importedAt,
      sourceFile,
      gyms,
      removalReports: previous.removalReports,
    });

    const summary: GymImportSummary = {
      total: gyms.length,
      added,
      updated,
      removed,
      unchanged,
      importedAt,
      sourceFile,
    };

    return res.status(201).json({
      message: initialImport
        ? "Gym baseline imported successfully. Future uploads will identify newly added gyms."
        : "Gym CSV imported successfully.",
      summary,
    });
  } catch (error) {
    console.error("Gym CSV import failed", error);
    return res.status(400).json({
      error: error instanceof Error ? error.message : "The gym CSV could not be imported.",
    });
  }
}
