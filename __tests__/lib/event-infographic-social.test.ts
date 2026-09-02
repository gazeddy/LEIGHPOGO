import sharp from "sharp";
import {
  buildEventInfographicSocialSvg,
  summariseInfographicRaidSchedule,
} from "../../lib/event-infographic-social";
import type { PokemonGoEventSummary } from "../../lib/events";

function fixture(): PokemonGoEventSummary {
  return {
    eventID: "mega-ascension",
    name: "Mega Ascension",
    eventType: "event",
    heading: "Event",
    link: "https://leekduck.com/events/mega-ascension/",
    image: null,
    start: "2026-08-31T10:00:00.000",
    end: "2026-09-04T23:59:00.000",
    description: "Mega Energy surges worldwide with raids and event bonuses.",
    bonuses: [
      "Remote Raid Pass limit increased to 30 from Monday, August 31, to Friday, September 4, 2026",
    ],
    wildSpawns: [
      { name: "Bellsprout", image: null, canBeShiny: true },
      { name: "Chespin", image: null, canBeShiny: true },
    ],
    featuredRaids: [],
    raidSchedule: [
      {
        date: "Monday, August 31",
        time: null,
        label: null,
        bosses: [
          { name: "Mega Dragonite", image: null, canBeShiny: true, raidType: "Mega" },
          { name: "Mega Latias", image: null, canBeShiny: true, raidType: "Mega" },
          { name: "Mega Latios", image: null, canBeShiny: true, raidType: "Mega" },
        ],
      },
      {
        date: "Tuesday, September 1",
        time: null,
        label: null,
        bosses: [
          { name: "Mega Falinks", image: null, canBeShiny: true, raidType: "Mega" },
          { name: "Mega Latias", image: null, canBeShiny: true, raidType: "Mega" },
          { name: "Mega Latios", image: null, canBeShiny: true, raidType: "Mega" },
        ],
      },
      {
        date: "Wednesday, September 2",
        time: null,
        label: null,
        bosses: [
          { name: "Mega Skarmory", image: null, canBeShiny: true, raidType: "Mega" },
          { name: "Mega Latias", image: null, canBeShiny: true, raidType: "Mega" },
          { name: "Mega Latios", image: null, canBeShiny: true, raidType: "Mega" },
        ],
      },
    ],
    tags: [],
    campfireUrl: null,
    source: "feed",
  };
}

describe("information-led event infographic", () => {
  test("separates every-day raid bosses from the changing daily bosses", () => {
    const summary = summariseInfographicRaidSchedule(fixture());

    expect(summary.commonBosses.map((boss) => boss.name)).toEqual([
      "Mega Latias",
      "Mega Latios",
    ]);
    expect(summary.days.map((day) => day.bosses.map((boss) => boss.name))).toEqual([
      ["Mega Dragonite"],
      ["Mega Falinks"],
      ["Mega Skarmory"],
    ]);
  });

  test("burns all infographic copy into vector paths instead of SVG text nodes", () => {
    const svg = buildEventInfographicSocialSvg(fixture());

    expect(svg).toContain('data-vector-text="EVENT BONUSES"');
    expect(svg).toContain("Remote Raid Pass limit increased");
    expect(svg).toContain('data-vector-text="WILD SPAWNS"');
    expect(svg).toContain('data-vector-text="Bellsprout"');
    expect(svg).toContain('data-vector-text="RAID SCHEDULE"');
    expect(svg).toContain('data-vector-text="EVERY DAY"');
    expect(svg).toContain("Mega Latias * Mega Latios");
    expect(svg).toContain("Monday August 31");
    expect(svg).toContain("Mega Dragonite");
    expect(svg).not.toContain("<text");
    expect((svg.match(/<path /g) ?? []).length).toBeGreaterThan(10);
  });

  test("rasterizes the path-based infographic to a real 1080 by 1350 PNG", async () => {
    const svg = buildEventInfographicSocialSvg(fixture());
    const png = await sharp(Buffer.from(svg, "utf8")).png().toBuffer();
    const metadata = await sharp(png).metadata();

    expect(metadata.format).toBe("png");
    expect(metadata.width).toBe(1080);
    expect(metadata.height).toBe(1350);
  });
});
