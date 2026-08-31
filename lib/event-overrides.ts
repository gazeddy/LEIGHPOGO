import fs from "node:fs/promises";
import path from "node:path";
import type { PokemonGoEventSummary } from "./events";

const EVENT_OVERRIDES_PATH =
  process.env.EVENT_OVERRIDES_PATH?.trim() ||
  path.join(process.cwd(), "data", "event-overrides.json");

const EVENT_TYPE_RULES_PATH =
  process.env.EVENT_TYPE_RULES_PATH?.trim() ||
  path.join(process.cwd(), "data", "event-type-rules.json");

export interface CampfireMeetupInput {
  label?: string | null;
  url: string;
  activeFrom: string;
}

export interface CampfireMeetup {
  label: string | null;
  url: string;
  activeFrom: string;
}

export interface EventOverrideInput {
  eventID: string;
  name: string;
  heading: string;
  description?: string | null;
  campfireUrl?: string | null;
  campfireMeetups?: CampfireMeetupInput[];
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
  campfireMeetups: CampfireMeetup[];
  image: string | null;
  tags: string[];
  hidden: boolean;
  hideAt: string | null;
  updatedAt: string;
}

export interface EventTypeRuleInput {
  eventType: string;
  hidden?: boolean;
  hideAt?: string | null;
}

export interface EventTypeRule {
  eventType: string;
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

function normaliseEventType(value: unknown): string {
  const eventType = requiredString(value, "Event type")
    .toLowerCase()
    .replace(/^#+/, "")
    .replace(/\s+/g, "-");

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(eventType)) {
    throw new Error("Event type must contain letters, numbers or hyphens");
  }

  return eventType;
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

function validateDateTime(value: unknown, field: string): string | null {
  const dateTime = optionalString(value);

  if (!dateTime) {
    return null;
  }

  const timestamp = Date.parse(dateTime);

  if (!Number.isFinite(timestamp)) {
    throw new Error(`${field} must be a valid date and time`);
  }

  return new Date(timestamp).toISOString();
}

function validateHideAt(value: unknown): string | null {
  return validateDateTime(value, "Scheduled hide time");
}

function normaliseCampfireMeetups(value: unknown): CampfireMeetup[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((rawMeetup, index): CampfireMeetup | null => {
      if (!rawMeetup || typeof rawMeetup !== "object" || Array.isArray(rawMeetup)) {
        return null;
      }

      const candidate = rawMeetup as Record<string, unknown>;
      const url = validateUrl(
        optionalString(candidate.url),
        `Campfire meetup ${index + 1} URL`,
      );
      const activeFrom = validateDateTime(
        candidate.activeFrom,
        `Campfire meetup ${index + 1} switch time`,
      );

      if (!url || !activeFrom) {
        throw new Error(
          `Campfire meetup ${index + 1} requires a URL and switch time`,
        );
      }

      return {
        label: optionalString(candidate.label),
        url,
        activeFrom,
      };
    })
    .filter((meetup): meetup is CampfireMeetup => meetup !== null)
    .sort((left, right) => left.activeFrom.localeCompare(right.activeFrom))
    .slice(0, 14);
}

export function activeCampfireMeetup(
  override: Pick<EventOverride, "campfireUrl" | "campfireMeetups">,
  now: Date = new Date(),
): CampfireMeetup | null {
  const meetups = override.campfireMeetups ?? [];

  if (meetups.length === 0) {
    return override.campfireUrl
      ? {
          label: null,
          url: override.campfireUrl,
          activeFrom: new Date(0).toISOString(),
        }
      : null;
  }

  const nowMs = now.getTime();
  let active = meetups[0];

  for (const meetup of meetups) {
    const switchAt = Date.parse(meetup.activeFrom);
    if (!Number.isFinite(switchAt) || switchAt > nowMs) {
      break;
    }
    active = meetup;
  }

  return active;
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
      campfireMeetups: normaliseCampfireMeetups(candidate.campfireMeetups),
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

function normaliseEventTypeRule(value: unknown): EventTypeRule | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;

  try {
    return {
      eventType: normaliseEventType(candidate.eventType),
      hidden: candidate.hidden === true,
      hideAt: validateHideAt(candidate.hideAt),
      updatedAt: requiredString(candidate.updatedAt, "Updated at"),
    };
  } catch {
    return null;
  }
}

async function writeJsonFile<T>(filePath: string, values: T[]): Promise<void> {
  const directory = path.dirname(filePath);
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;

  await fs.mkdir(directory, { recursive: true });

  try {
    await fs.writeFile(
      temporaryPath,
      `${JSON.stringify(values, null, 2)}\n`,
      "utf8",
    );
    await fs.rename(temporaryPath, filePath);
  } finally {
    await fs.unlink(temporaryPath).catch(() => undefined);
  }
}

async function readJsonArray(filePath: string): Promise<unknown[]> {
  try {
    const source = await fs.readFile(filePath, "utf8");
    const parsed: unknown = JSON.parse(source);

    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;

    if (code === "ENOENT" || error instanceof SyntaxError) {
      return [];
    }

    throw error;
  }
}

export async function readEventOverrides(): Promise<EventOverride[]> {
  return (await readJsonArray(EVENT_OVERRIDES_PATH))
    .map(normaliseOverride)
    .filter((override): override is EventOverride => override !== null)
    .sort((left, right) => left.eventID.localeCompare(right.eventID));
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
    campfireMeetups: normaliseCampfireMeetups(input.campfireMeetups),
    image: validateUrl(optionalString(input.image), "Image URL"),
    tags: normaliseTags(input.tags),
    hidden: input.hidden === true,
    hideAt: validateHideAt(input.hideAt),
    updatedAt: new Date().toISOString(),
  };
  const existing = await readEventOverrides();
  const remaining = existing.filter((item) => item.eventID !== override.eventID);

  await writeJsonFile(EVENT_OVERRIDES_PATH, [...remaining, override]);
  return override;
}

export async function deleteEventOverride(eventID: string): Promise<boolean> {
  const id = requiredString(eventID, "Event ID");
  const existing = await readEventOverrides();
  const remaining = existing.filter((override) => override.eventID !== id);

  if (remaining.length === existing.length) {
    return false;
  }

  await writeJsonFile(EVENT_OVERRIDES_PATH, remaining);
  return true;
}

export async function readEventTypeRules(): Promise<EventTypeRule[]> {
  return (await readJsonArray(EVENT_TYPE_RULES_PATH))
    .map(normaliseEventTypeRule)
    .filter((rule): rule is EventTypeRule => rule !== null)
    .sort((left, right) => left.eventType.localeCompare(right.eventType));
}

export async function saveEventTypeRule(
  input: EventTypeRuleInput,
): Promise<EventTypeRule> {
  const rule: EventTypeRule = {
    eventType: normaliseEventType(input.eventType),
    hidden: input.hidden === true,
    hideAt: validateHideAt(input.hideAt),
    updatedAt: new Date().toISOString(),
  };
  const existing = await readEventTypeRules();
  const remaining = existing.filter((item) => item.eventType !== rule.eventType);

  await writeJsonFile(EVENT_TYPE_RULES_PATH, [...remaining, rule]);
  return rule;
}

export async function deleteEventTypeRule(eventType: string): Promise<boolean> {
  const type = normaliseEventType(eventType);
  const existing = await readEventTypeRules();
  const remaining = existing.filter((rule) => rule.eventType !== type);

  if (remaining.length === existing.length) {
    return false;
  }

  await writeJsonFile(EVENT_TYPE_RULES_PATH, remaining);
  return true;
}

function hideTimeReached(
  hidden: boolean,
  hideAt: string | null,
  now: Date,
): boolean {
  if (hidden) {
    return true;
  }

  if (!hideAt) {
    return false;
  }

  const timestamp = Date.parse(hideAt);
  return Number.isFinite(timestamp) && timestamp <= now.getTime();
}

export async function applyEventOverrides(
  events: PokemonGoEventSummary[],
  now: Date = new Date(),
): Promise<PokemonGoEventSummary[]> {
  const [overrides, typeRules] = await Promise.all([
    readEventOverrides(),
    readEventTypeRules(),
  ]);
  const overrideByEventID = new Map(
    overrides.map((override) => [override.eventID, override]),
  );
  const ruleByEventType = new Map(
    typeRules.map((rule) => [rule.eventType, rule]),
  );

  return events.flatMap((event) => {
    const override = overrideByEventID.get(event.eventID);
    const typeRule = ruleByEventType.get(normaliseEventType(event.eventType));
    const eventIsHidden =
      (override && hideTimeReached(override.hidden, override.hideAt, now)) ||
      (typeRule && hideTimeReached(typeRule.hidden, typeRule.hideAt, now));

    if (eventIsHidden) {
      return [];
    }

    if (!override) {
      return [event];
    }

    const activeMeetup = activeCampfireMeetup(override, now);
    const campfireUrl = activeMeetup?.url ?? null;

    return [
      {
        ...event,
        name: override.name,
        heading: override.heading,
        description: override.description,
        campfireUrl,
        image: override.image,
        tags: override.tags,
        link: campfireUrl || event.link,
      },
    ];
  });
}
