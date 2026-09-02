import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { PokemonGoEventSummary } from "../../lib/events";
import {
  automaticInfographicEvents,
  publicEventInfographicUrl,
  writePublicEventInfographic,
} from "../../lib/event-infographic-public";
import { isInfographicRuntimeFile } from "../../lib/event-infographic-automation";

function event(overrides: Partial<PokemonGoEventSummary> = {}): PokemonGoEventSummary {
  return {
    eventID: "mega-ascension",
    name: "Mega Ascension",
    eventType: "event",
    heading: "Event",
    link: "https://example.com/event",
    image: null,
    start: "2026-09-01T10:00:00.000",
    end: "2026-09-04T20:00:00.000",
    description: "Event description",
    bonuses: ["Double catch XP"],
    wildSpawns: [],
    featuredRaids: [],
    raidSchedule: [],
    tags: [],
    campfireUrl: null,
    source: "feed",
    ...overrides,
  };
}

describe("public event infographic generation", () => {
  test("selects upcoming bonus-bearing events only and deduplicates event IDs", () => {
    const now = new Date("2026-09-02T12:00:00.000Z");
    const selected = automaticInfographicEvents(
      [
        event(),
        event({ name: "Duplicate" }),
        event({ eventID: "expired", end: "2026-09-01T23:59:00.000" }),
        event({ eventID: "no-bonus", bonuses: [] }),
        event({
          eventID: "later",
          start: "2026-09-03T10:00:00.000",
          end: "2026-09-05T20:00:00.000",
        }),
      ],
      { now },
    );

    expect(selected.map((item) => item.eventID)).toEqual([
      "mega-ascension",
      "later",
    ]);
  });

  test("writes a stable public PNG filename atomically", async () => {
    const outputDirectory = await fs.mkdtemp(
      path.join(os.tmpdir(), "leighpogo-infographic-"),
    );
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);

    try {
      const result = await writePublicEventInfographic(event(), {
        outputDirectory,
        render: async () => png,
      });

      expect(result.filename).toBe("mega-ascension-leighpogo.png");
      expect(result.publicUrl).toBe(
        "/generated/events/mega-ascension-leighpogo.png",
      );
      expect(await fs.readFile(result.filePath)).toEqual(png);
      expect(await fs.readdir(outputDirectory)).toEqual([
        "mega-ascension-leighpogo.png",
      ]);
    } finally {
      await fs.rm(outputDirectory, { recursive: true, force: true });
    }
  });

  test("exposes a stable public URL without needing the admin API", () => {
    expect(publicEventInfographicUrl(event())).toBe(
      "/generated/events/mega-ascension-leighpogo.png",
    );
  });

  test("watches both the event cache and event override runtime files", () => {
    expect(isInfographicRuntimeFile("events-cache.json")).toBe(true);
    expect(isInfographicRuntimeFile("event-overrides.json")).toBe(true);
    expect(isInfographicRuntimeFile("events-cache.json.123.tmp")).toBe(false);
    expect(isInfographicRuntimeFile("unrelated.json")).toBe(false);
  });
});
