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

  test("puts readable event information into the SVG rather than only sprites", () => {
    const svg = buildEventInfographicSocialSvg(fixture());

    expect(svg).toContain("EVENT BONUSES");
    expect(svg).toContain("Remote Raid Pass limit increased");
    expect(svg).toContain("WILD SPAWNS");
    expect(svg).toContain("Bellsprout");
    expect(svg).toContain("RAID SCHEDULE");
    expect(svg).toContain("EVERY DAY");
    expect(svg).toContain("Mega Latias • Mega Latios");
    expect(svg).toContain("Monday August 31");
    expect(svg).toContain("Mega Dragonite");
  });

  test("rasterizes the information-led SVG to a real 1080 by 1350 PNG", async () => {
    const svg = buildEventInfographicSocialSvg(fixture());
    const png = await sharp(Buffer.from(svg, "utf8")).png().toBuffer();
    const metadata = await sharp(png).metadata();

    expect(metadata.format).toBe("png");
    expect(metadata.width).toBe(1080);
    expect(metadata.height).toBe(1350);
  });
});
