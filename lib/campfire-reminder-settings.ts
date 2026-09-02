import fs from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_CAMPFIRE_REMINDER_SETTINGS,
  type CampfireReminderSettings,
  type CampfireReminderSettingsInput,
} from "./campfire-reminder-rules";

const CAMPFIRE_REMINDER_SETTINGS_PATH =
  process.env.CAMPFIRE_REMINDER_SETTINGS_PATH?.trim() ||
  path.join(process.cwd(), "data", "campfire-reminder-settings.json");

function normaliseEventTypes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) =>
          item
            .trim()
            .toLowerCase()
            .replace(/^#+/, "")
            .replace(/\s+/g, "-"),
        )
        .filter((item) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item)),
    ),
  ).slice(0, 80);
}

function normaliseKeywords(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.replace(/\s+/g, " ").trim().toLowerCase())
        .filter(Boolean)
        .map((item) => item.slice(0, 80)),
    ),
  ).slice(0, 80);
}

function normaliseSettings(value: unknown): CampfireReminderSettings | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;

  const updatedAt =
    typeof candidate.updatedAt === "string" &&
    Number.isFinite(Date.parse(candidate.updatedAt))
      ? new Date(candidate.updatedAt).toISOString()
      : null;

  return {
    eventTypes: normaliseEventTypes(candidate.eventTypes),
    nameKeywords: normaliseKeywords(candidate.nameKeywords),
    includeWeekendEvents: candidate.includeWeekendEvents === true,
    updatedAt,
  };
}

export async function readCampfireReminderSettings(): Promise<CampfireReminderSettings> {
  try {
    const source = await fs.readFile(CAMPFIRE_REMINDER_SETTINGS_PATH, "utf8");
    const parsed: unknown = JSON.parse(source);
    return normaliseSettings(parsed) ?? DEFAULT_CAMPFIRE_REMINDER_SETTINGS;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || error instanceof SyntaxError) {
      return DEFAULT_CAMPFIRE_REMINDER_SETTINGS;
    }
    throw error;
  }
}

export async function saveCampfireReminderSettings(
  input: CampfireReminderSettingsInput,
): Promise<CampfireReminderSettings> {
  const settings: CampfireReminderSettings = {
    eventTypes: normaliseEventTypes(input.eventTypes),
    nameKeywords: normaliseKeywords(input.nameKeywords),
    includeWeekendEvents: input.includeWeekendEvents === true,
    updatedAt: new Date().toISOString(),
  };
  const directory = path.dirname(CAMPFIRE_REMINDER_SETTINGS_PATH);
  const temporaryPath = `${CAMPFIRE_REMINDER_SETTINGS_PATH}.${process.pid}.${Date.now()}.tmp`;

  await fs.mkdir(directory, { recursive: true });
  try {
    await fs.writeFile(
      temporaryPath,
      `${JSON.stringify(settings, null, 2)}\n`,
      "utf8",
    );
    await fs.rename(temporaryPath, CAMPFIRE_REMINDER_SETTINGS_PATH);
  } finally {
    await fs.unlink(temporaryPath).catch(() => undefined);
  }

  return settings;
}
