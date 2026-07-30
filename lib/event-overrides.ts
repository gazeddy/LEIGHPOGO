import fs from "node:fs/promises";
import path from "node:path";
import type { PokemonGoEventSummary } from "./events";

const EVENT_OVERRIDES_PATH =
  process.env.EVENT_OVERRIDES_PATH?.trim() ||
  path.join(process.cwd(), "data", "event-overrides.json");

export interface EventOverrideInput {
  eventID: string;
  name: string;
  heading: string;
  description?: string | null;
  campfireUrl?: string | null;
  image?: string | null;
  tags?: string[];
  hidden?: boolean;
  hideAt?: string | null;
}

export interface EventOverride {
  eventID: string;
  name: string;
  heading: string;
  description: string | null;
  campfireUrl: string | null;
  image: string | null;
  tags: string[];
  hidden: boolean;
  hideAt: string | null;
  updatedAt: string;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required`);
  }

  return value.trim();
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normaliseTags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter((tag): tag is string => typeof tag === "string")
        .map((tag) =>
          tag
            .trim()
            .toLowerCase()
            .replace(/^#+/, "")
            .replace(/\s+/g, "-"),
        )
        .filter(Boolean),
    ),
  ).slice(0, 30);
}

function validateUrl(value: string | null, field: string): string | null {
  if (!value) {
    return null;
  }

  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${field} must be a valid URL`);
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(`${field} must use http or https`);
  }

  return parsed.toString();
}

function validateHideAt(value: unknown): string | null {
  const hideAt = optionalString(value);

  if (!hideAt) {
    return null;
  }

  const timestamp = Date.parse(hideAt);

  if (!Number.isFinite(timestamp)) {
    throw new Error("Scheduled hide time must be a valid date and time");
  }

  return new Date(timestamp).toISOString();
}

function normaliseOverride(value: unknown): EventOverride | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;

  try {
    return {
      eventID: requiredString(candidate.eventID, "Event ID"),
      name: requiredString(candidate.name, "Name"),
      heading: requiredString(candidate.heading, "Heading"),
      description: optionalString(candidate.description),
      campfireUrl: validateUrl(optionalString(candidate.campfireUrl), "Campfire URL"),
      image: validateUrl(optionalString(candidate.image), "Image URL"),
      tags: normaliseTags(candidate.tags),
      hidden: candidate.hidden === true,
      hideAt: validateHideAt(candidate.hideAt),
      updatedAt: requiredString(candidate.updatedAt, "Updated at"),
    };
  } catch {
    return null;
  }
}

async function writeEventOverrides(overrides: EventOverride[]): Promise<void> {
  const directory = path.dirname(EVENT_OVERRIDES_PATH);
  const temporaryPath = `${EVENT_OVERRIDES_PATH}.${process.pid}.${Date.now()}.tmp`;

  await fs.mkdir(directory, { recursive: true });

  try {
    await fs.writeFile(
      temporaryPath,
      `${JSON.stringify(overrides, null, 2)}\n`,
      "utf8",
    );
    await fs.rename(temporaryPath, EVENT_OVERRIDES_PATH);
  } finally {
    await fs.unlink(temporaryPath).catch(() => undefined);
  }
}

export async function readEventOverrides(): Promise<EventOverride[]> {
  try {
    const source = await fs.readFile(EVENT_OVERRIDES_PATH, "utf8");
    const parsed: unknown = JSON.parse(source);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map(normaliseOverride)
      .filter((override): override is EventOverride => override !== null)
      .sort((left, right) => left.eventID.localeCompare(right.eventID));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;

    if (code === "ENOENT" || error instanceof SyntaxError) {
      return [];
    }

    throw error;
  }
}

export async function saveEventOverride(
  input: EventOverrideInput,
): Promise<EventOverride> {
  const override: EventOverride = {
    eventID: requiredString(input.eventID, "Event ID"),
    name: requiredString(input.name, "Name"),
    heading: requiredString(input.heading, "Heading"),
    description: optionalString(input.description),
    campfireUrl: validateUrl(optionalString(input.campfireUrl), "Campfire URL"),
    image: validateUrl(optionalString(input.image), "Image URL"),
    tags: normaliseTags(input.tags),
    hidden: input.hidden === true,
    hideAt: validateHideAt(input.hideAt),
    updatedAt: new Date().toISOString(),
  };
  const existing = await readEventOverrides();
  const remaining = existing.filter((item) => item.eventID !== override.eventID);

  await writeEventOverrides([...remaining, override]);
  return override;
}

export async function deleteEventOverride(eventID: string): Promise<boolean> {
  const id = requiredString(eventID, "Event ID");
  const existing = await readEventOverrides();
  const remaining = existing.filter((override) => override.eventID !== id);

  if (remaining.length === existing.length) {
    return false;
  }

  await writeEventOverrides(remaining);
  return true;
}

export async function applyEventOverrides(
  events: PokemonGoEventSummary[],
  now: Date = new Date(),
): Promise<PokemonGoEventSummary[]> {
  const overrideByEventID = new Map(
    (await readEventOverrides()).map((override) => [override.eventID, override]),
  );

  return events.flatMap((event) => {
    const override = overrideByEventID.get(event.eventID);

    if (!override) {
      return [event];
    }

    const hideAt = override.hideAt ? Date.parse(override.hideAt) : null;
    const scheduledHideReached =
      hideAt !== null && Number.isFinite(hideAt) && hideAt <= now.getTime();

    if (override.hidden || scheduledHideReached) {
      return [];
    }

    return [
      {
        ...event,
        name: override.name,
        heading: override.heading,
        description: override.description,
        campfireUrl: override.campfireUrl,
        image: override.image,
        tags: override.tags,
        link: override.campfireUrl || event.link,
      },
    ];
  });
}
