import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import type { PokemonGoEventSummary } from "./events";
import { applyEventOverrides } from "./event-overrides";
import { queueAutomaticEventInfographics } from "./event-infographic-public";

const EVENTS_CACHE_PATH =
  process.env.EVENTS_CACHE_PATH?.trim() ||
  path.join(process.cwd(), "data", "events-cache.json");
const EVENT_OVERRIDES_PATH =
  process.env.EVENT_OVERRIDES_PATH?.trim() ||
  path.join(process.cwd(), "data", "event-overrides.json");
const WATCH_DEBOUNCE_MS = 750;

let watcher: fs.FSWatcher | null = null;
let debounceTimer: NodeJS.Timeout | null = null;
let refreshInFlight: Promise<void> | null = null;
let refreshAgain = false;

interface EventCacheShape {
  events?: unknown;
}

function isCachedEvent(value: unknown): value is PokemonGoEventSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const event = value as Partial<PokemonGoEventSummary>;
  return (
    typeof event.eventID === "string" &&
    typeof event.name === "string" &&
    typeof event.start === "string" &&
    typeof event.end === "string" &&
    typeof event.eventType === "string" &&
    typeof event.heading === "string"
  );
}

export function cachedInfographicEventsFromJson(source: string): PokemonGoEventSummary[] {
  const parsed = JSON.parse(source) as EventCacheShape;
  if (!Array.isArray(parsed.events)) return [];
  return parsed.events.filter(isCachedEvent);
}

async function readCachedEvents(): Promise<PokemonGoEventSummary[]> {
  try {
    return cachedInfographicEventsFromJson(
      await fsp.readFile(EVENTS_CACHE_PATH, "utf8"),
    );
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || error instanceof SyntaxError) return [];
    throw error;
  }
}

async function regenerateFromCurrentCache(reason: string): Promise<void> {
  const events = await readCachedEvents();
  if (events.length === 0) return;
  const overridden = await applyEventOverrides(events);
  queueAutomaticEventInfographics(overridden, reason);
}

function requestRegeneration(reason: string): void {
  if (refreshInFlight) {
    refreshAgain = true;
    return;
  }

  refreshInFlight = regenerateFromCurrentCache(reason)
    .catch((error) => {
      console.error(`Event infographic automation failed (${reason})`, error);
    })
    .finally(() => {
      refreshInFlight = null;
      if (refreshAgain) {
        refreshAgain = false;
        requestRegeneration("coalesced runtime update");
      }
    });
}

function scheduleRegeneration(reason: string): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    requestRegeneration(reason);
  }, WATCH_DEBOUNCE_MS);
  debounceTimer.unref?.();
}

function watchedFileChanged(filename: string | Buffer | null): boolean {
  if (!filename) return true;
  const value = filename.toString();
  return (
    value === path.basename(EVENTS_CACHE_PATH) ||
    value === path.basename(EVENT_OVERRIDES_PATH)
  );
}

export function startEventInfographicAutomation(): void {
  if (watcher) return;

  const directory = path.dirname(EVENTS_CACHE_PATH);
  if (directory !== path.dirname(EVENT_OVERRIDES_PATH)) {
    console.warn(
      "Event infographic automation expects the events cache and overrides in the same runtime directory; automatic watching is disabled.",
    );
    requestRegeneration("service startup");
    return;
  }

  void fsp.mkdir(directory, { recursive: true }).then(() => {
    if (watcher) return;

    watcher = fs.watch(directory, { persistent: false }, (_eventType, filename) => {
      if (watchedFileChanged(filename)) {
        scheduleRegeneration("event cache or override update");
      }
    });
    watcher.on("error", (error) => {
      console.error("Event infographic runtime watcher failed", error);
      watcher?.close();
      watcher = null;
    });

    requestRegeneration("service startup");
  }).catch((error) => {
    console.error("Event infographic automation could not start", error);
  });
}
