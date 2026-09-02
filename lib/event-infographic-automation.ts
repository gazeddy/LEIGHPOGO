import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { queueAutomaticEventInfographics } from "./event-infographic-public";
import { getInfographicEventsData } from "./infographic-events-server";

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

async function regenerateFromCurrentCache(reason: string): Promise<void> {
  const data = await getInfographicEventsData(240);
  queueAutomaticEventInfographics(data.events, reason);
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

export function isInfographicRuntimeFile(filename: string | Buffer | null): boolean {
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

  void fsp
    .mkdir(directory, { recursive: true })
    .then(() => {
      if (watcher) return;

      watcher = fs.watch(directory, { persistent: false }, (_eventType, filename) => {
        if (isInfographicRuntimeFile(filename)) {
          scheduleRegeneration("event cache or override update");
        }
      });
      watcher.on("error", (error) => {
        console.error("Event infographic runtime watcher failed", error);
        watcher?.close();
        watcher = null;
      });

      requestRegeneration("service startup");
    })
    .catch((error) => {
      console.error("Event infographic automation could not start", error);
    });
}
