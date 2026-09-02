import fs from "node:fs/promises";
import path from "node:path";
import type { PokemonGoEventSummary } from "./events";
import { infographicFilename } from "./event-infographic";
import { renderEventInfographicSocialPng } from "./event-infographic-social";

const DEFAULT_PUBLIC_DIRECTORY = path.join(
  process.cwd(),
  "public",
  "generated",
  "events",
);
const DEFAULT_PUBLIC_URL_PREFIX = "/generated/events";
const MAX_AUTOMATIC_EVENTS = 80;

export interface PublicEventInfographicResult {
  eventID: string;
  filename: string;
  filePath: string;
  publicUrl: string;
  bytes: number;
}

interface WritePublicEventInfographicOptions {
  outputDirectory?: string;
  render?: (event: PokemonGoEventSummary) => Promise<Buffer>;
}

interface AutomaticInfographicOptions {
  now?: Date;
  maxEvents?: number;
}

let generationQueue: Promise<void> = Promise.resolve();

function londonDateKey(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return `${values.year}-${values.month}-${values.day}`;
}

export function eventShouldHaveAutomaticInfographic(
  event: PokemonGoEventSummary,
  now: Date = new Date(),
): boolean {
  return (
    (event.bonuses?.length ?? 0) > 0 &&
    event.end.slice(0, 10) >= londonDateKey(now)
  );
}

export function automaticInfographicEvents(
  events: PokemonGoEventSummary[],
  options: AutomaticInfographicOptions = {},
): PokemonGoEventSummary[] {
  const now = options.now ?? new Date();
  const maxEvents = Math.max(1, options.maxEvents ?? MAX_AUTOMATIC_EVENTS);
  const seen = new Set<string>();

  return events
    .filter((event) => eventShouldHaveAutomaticInfographic(event, now))
    .filter((event) => {
      const key = event.eventID.trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => left.start.localeCompare(right.start))
    .slice(0, maxEvents);
}

export function publicEventInfographicUrl(
  event: Pick<PokemonGoEventSummary, "eventID">,
): string {
  return `${DEFAULT_PUBLIC_URL_PREFIX}/${infographicFilename(event)}`;
}

export async function writePublicEventInfographic(
  event: PokemonGoEventSummary,
  options: WritePublicEventInfographicOptions = {},
): Promise<PublicEventInfographicResult> {
  const outputDirectory = options.outputDirectory ?? DEFAULT_PUBLIC_DIRECTORY;
  const render = options.render ?? renderEventInfographicSocialPng;
  const filename = infographicFilename(event);
  const filePath = path.join(outputDirectory, filename);
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const png = await render(event);

  await fs.mkdir(outputDirectory, { recursive: true });

  try {
    await fs.writeFile(temporaryPath, png);
    await fs.rename(temporaryPath, filePath);
  } finally {
    await fs.unlink(temporaryPath).catch(() => undefined);
  }

  return {
    eventID: event.eventID,
    filename,
    filePath,
    publicUrl: publicEventInfographicUrl(event),
    bytes: png.length,
  };
}

async function generateAutomaticInfographics(
  events: PokemonGoEventSummary[],
  reason: string,
): Promise<void> {
  const candidates = automaticInfographicEvents(events);

  for (const event of candidates) {
    try {
      const result = await writePublicEventInfographic(event);
      console.info(
        `Generated public event infographic (${reason}): ${result.publicUrl}`,
      );
    } catch (error) {
      console.error(
        `Automatic event infographic generation failed for ${event.eventID} (${reason})`,
        error,
      );
    }
  }
}

export function queueAutomaticEventInfographics(
  events: PokemonGoEventSummary[],
  reason: string,
): void {
  const candidates = automaticInfographicEvents(events);
  if (candidates.length === 0) return;

  generationQueue = generationQueue
    .then(() => generateAutomaticInfographics(candidates, reason))
    .catch((error) => {
      console.error("Automatic event infographic queue failed", error);
    });
}
