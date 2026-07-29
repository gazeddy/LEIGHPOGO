import fs from "node:fs/promises";
import path from "node:path";
import type { PokemonGoEventSummary } from "./events";

const LOCAL_EVENTS_PATH =
  process.env.LOCAL_EVENTS_PATH?.trim() ||
  path.join(process.cwd(), "data", "local-events.json");

export interface LocalEventInput {
  name: string;
  eventType: string;
  heading?: string;
  description?: string;
  start: string;
  end: string;
  campfireUrl?: string;
  image?: string;
  tags?: string[];
}

export interface LocalEvent extends LocalEventInput {
  id: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required`);
  }

  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normaliseTags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter((tag): tag is string => typeof tag === "string")
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean),
    ),
  ).slice(0, 30);
}

function validateUrl(value: string | undefined, field: string): string | undefined {
  if (!value) {
    return undefined;
  }

  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${field} must be a valid URL`);
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`${field} must use http or https`);
  }

  return parsed.toString();
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

function normaliseEvent(value: unknown): LocalEvent | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const event = value as Record<string, unknown>;

  try {
    const name = requiredString(event.name, "Name");
    const eventType = requiredString(event.eventType, "Event type");
    const start = requiredString(event.start, "Start");
    const end = requiredString(event.end, "End");
    const id = requiredString(event.id, "ID");
    const createdAt = requiredString(event.createdAt, "Created at");
    const updatedAt = requiredString(event.updatedAt, "Updated at");

    return {
      id,
      name,
      eventType,
      heading: optionalString(event.heading),
      description: optionalString(event.description),
      start,
      end,
      campfireUrl: optionalString(event.campfireUrl),
      image: optionalString(event.image),
      tags: normaliseTags(event.tags),
      createdAt,
      updatedAt,
    };
  } catch {
    return null;
  }
}

async function writeLocalEvents(events: LocalEvent[]): Promise<void> {
  const directory = path.dirname(LOCAL_EVENTS_PATH);
  const temporaryPath = `${LOCAL_EVENTS_PATH}.${process.pid}.${Date.now()}.tmp`;

  await fs.mkdir(directory, { recursive: true });

  try {
    await fs.writeFile(temporaryPath, `${JSON.stringify(events, null, 2)}\n`, "utf8");
    await fs.rename(temporaryPath, LOCAL_EVENTS_PATH);
  } finally {
    await fs.unlink(temporaryPath).catch(() => undefined);
  }
}

export async function readLocalEvents(): Promise<LocalEvent[]> {
  try {
    const source = await fs.readFile(LOCAL_EVENTS_PATH, "utf8");
    const parsed: unknown = JSON.parse(source);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map(normaliseEvent)
      .filter((event): event is LocalEvent => event !== null)
      .sort((left, right) => left.start.localeCompare(right.start));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;

    if (code === "ENOENT" || error instanceof SyntaxError) {
      return [];
    }

    throw error;
  }
}

export async function createLocalEvent(input: LocalEventInput): Promise<LocalEvent> {
  const name = requiredString(input.name, "Name");
  const eventType = requiredString(input.eventType, "Event type").toLowerCase();
  const start = requiredString(input.start, "Start");
  const end = requiredString(input.end, "End");
  const startTime = Date.parse(start);
  const endTime = Date.parse(end);

  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) {
    throw new Error("Start and end must be valid dates");
  }

  if (endTime < startTime) {
    throw new Error("End must be after start");
  }

  const now = new Date().toISOString();
  const event: LocalEvent = {
    id: `local-${slugify(name) || "event"}-${Date.now().toString(36)}`,
    name,
    eventType,
    heading: optionalString(input.heading) || eventType,
    description: optionalString(input.description),
    start,
    end,
    campfireUrl: validateUrl(optionalString(input.campfireUrl), "Campfire URL"),
    image: validateUrl(optionalString(input.image), "Image URL"),
    tags: normaliseTags(input.tags),
    createdAt: now,
    updatedAt: now,
  };
  const events = await readLocalEvents();

  await writeLocalEvents([...events, event].sort((left, right) => left.start.localeCompare(right.start)));

  return event;
}

export async function deleteLocalEvent(id: string): Promise<boolean> {
  const events = await readLocalEvents();
  const remaining = events.filter((event) => event.id !== id);

  if (remaining.length === events.length) {
    return false;
  }

  await writeLocalEvents(remaining);
  return true;
}

export function localEventToSummary(event: LocalEvent): PokemonGoEventSummary {
  return {
    eventID: event.id,
    name: event.name,
    eventType: event.eventType,
    heading: event.heading || event.eventType,
    link: event.campfireUrl || null,
    image: event.image || null,
    start: event.start,
    end: event.end,
    tags: event.tags,
    description: event.description || null,
    campfireUrl: event.campfireUrl || null,
    source: "local",
  };
}
