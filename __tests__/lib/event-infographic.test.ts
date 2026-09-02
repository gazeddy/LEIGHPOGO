import {
  buildEventInfographicSvg,
  EVENT_INFOGRAPHIC_HEIGHT,
  EVENT_INFOGRAPHIC_WIDTH,
  infographicDateRange,
  infographicFilename,
  infographicRaidPokemon,
  renderEventInfographicPng,
} from "../../lib/event-infographic";
import type { PokemonGoEventSummary } from "../../lib/events";

function fixture(): PokemonGoEventSummary {
  return {
    eventID: "mega-ascension",
    name: "Mega Ascension",
    eventType: "event",
    heading: "Event",
    link: null,
    image: null,
    start: "2026-08-31T10:00:00.000",
    end: "2026-09-04T23:59:00.000",
    description: "Mega Energy surges worldwide with raids and event bonuses.",
    bonuses: ["2× Catch XP", "Extra special trades", "Increased shiny chance"],
    wildSpawns: [
      { name: "Drilbur", image: null, canBeShiny: true },
      { name: "Scraggy", image: null, canBeShiny: true },
    ],
    featuredRaids: [],
    raidSchedule: [
      {
        date: "Monday, August 31",
        time: null,
        label: null,
        bosses: [
          {
            name: "Mega Dragonite",
            image: null,
            canBeShiny: true,
            raidType: "Mega",
          },
          {
            name: "Mega Dragonite",
            image: null,
            canBeShiny: true,
            raidType: "Mega",
          },
          {
            name: "Mega Malamar",
            image: null,
            canBeShiny: true,
            raidType: "Mega",
          },
        ],
      },
    ],
    tags: [],
    campfireUrl: null,
    source: "feed",
  };
}

describe("event infographic rendering", () => {
  test("builds the fixed social portrait format with LeighPogo branding and no V4 badge", () => {
    const svg = buildEventInfographicSvg(fixture());

    expect(svg).toContain(`width="${EVENT_INFOGRAPHIC_WIDTH}"`);
    expect(svg).toContain(`height="${EVENT_INFOGRAPHIC_HEIGHT}"`);
    expect(svg).toContain("LEIGH");
    expect(svg).toContain("POGO");
    expect(svg).not.toContain("V4");
  });

  test("renders only event data supplied to the template", () => {
    const svg = buildEventInfographicSvg(fixture());

    expect(svg).toContain("EVENT BONUSES");
    expect(svg).toContain("2× Catch XP");
    expect(svg).toContain("WILD SPAWNS");
    expect(svg).toContain("Drilbur");
    expect(svg).toContain("RAIDS");
    expect(svg).toContain("Mega Dragonite");
    expect(svg).toContain("Mega Malamar");
  });

  test("deduplicates raid bosses across schedule entries", () => {
    expect(infographicRaidPokemon(fixture()).map((boss) => boss.name)).toEqual([
      "Mega Dragonite",
      "Mega Malamar",
    ]);
  });

  test("omits spawn and raid sections when they are absent", () => {
    const event = fixture();
    event.wildSpawns = [];
    event.raidSchedule = [];
    event.featuredRaids = [];

    const svg = buildEventInfographicSvg(event);
    expect(svg).not.toContain("WILD SPAWNS");
    expect(svg).not.toContain(">RAIDS<");
    expect(svg).toContain("EVENT DETAILS");
  });

  test("escapes event-provided XML characters even when wrapped across lines", () => {
    const event = fixture();
    event.bonuses = ["2× XP & Stardust <bonus>"];

    const svg = buildEventInfographicSvg(event);
    expect(svg).toContain("2× XP &amp; Stardust");
    expect(svg).toContain("&lt;bonus&gt;");
    expect(svg).not.toContain("<bonus>");
  });

  test("creates stable file names and readable date ranges", () => {
    expect(infographicFilename({ eventID: "Mega Finale / Day 1" })).toBe(
      "mega-finale-day-1-leighpogo.png",
    );
    expect(
      infographicDateRange(
        "2026-08-31T10:00:00.000",
        "2026-09-04T23:59:00.000",
      ),
    ).toBe("31 AUG – 4 SEPT 2026");
  });

  test("rasterizes the template into a real PNG", async () => {
    const png = await renderEventInfographicPng(fixture());

    expect(png.length).toBeGreaterThan(10_000);
    expect(Array.from(png.subarray(0, 8))).toEqual([
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a,
    ]);
  });
});
