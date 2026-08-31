import {
  buildDailyRaidSummaryPayload,
  hasActiveEventRaidBosses,
  isDailyRaidSummaryDue,
  selectDailyRaidSummaryBosses,
} from "../../lib/raid-daily-summary";
import type { RaidBossTickerItem } from "../../lib/events";

function item(
  eventID: string,
  category: RaidBossTickerItem["category"],
  boss: string,
  catchCp?: RaidBossTickerItem["catchCp"],
): RaidBossTickerItem {
  return {
    eventID,
    category,
    label: category,
    boss,
    start: "2026-08-31T10:00:00.000",
    end: "2026-09-01T00:00:00.000",
    link: null,
    state: "current",
    ...(catchCp ? { catchCp } : {}),
  };
}

describe("daily raid summary timing", () => {
  it("is due during the 18:00 Europe/London hour in BST", () => {
    expect(isDailyRaidSummaryDue(new Date("2026-08-31T17:00:00.000Z"))).toBe(true);
    expect(isDailyRaidSummaryDue(new Date("2026-08-31T17:45:00.000Z"))).toBe(true);
    expect(isDailyRaidSummaryDue(new Date("2026-08-31T16:59:59.000Z"))).toBe(false);
    expect(isDailyRaidSummaryDue(new Date("2026-08-31T18:00:00.000Z"))).toBe(false);
  });

  it("uses GMT correctly in winter", () => {
    expect(isDailyRaidSummaryDue(new Date("2026-12-01T18:00:00.000Z"))).toBe(true);
    expect(isDailyRaidSummaryDue(new Date("2026-12-01T17:00:00.000Z"))).toBe(false);
  });
});

describe("daily raid summary event trigger", () => {
  it("does not trigger for ordinary five-star or Mega rotations alone", () => {
    expect(
      hasActiveEventRaidBosses([
        item("five-star-normal", "five-star", "Kyogre"),
        item("ordinary-mega-gyarados", "mega", "Gyarados"),
      ]),
    ).toBe(false);
  });

  it("triggers for an active event-derived Mega raid schedule", () => {
    expect(
      hasActiveEventRaidBosses([
        item("mega-ascension--raid-2026-08-31-slot-mega", "mega", "Malamar"),
      ]),
    ).toBe(true);
  });

  it("triggers for a five-star-only event raid schedule", () => {
    expect(
      hasActiveEventRaidBosses([
        item("festival--raid-2026-09-05-slot-five-star", "five-star", "Armored Mewtwo"),
      ]),
    ).toBe(true);
  });

  it("does not trigger for a future event raid before it becomes current", () => {
    const next = item("festival--raid-2026-09-05-slot-five-star", "five-star", "Armored Mewtwo");
    next.state = "next";
    expect(hasActiveEventRaidBosses([next])).toBe(false);
  });
});

describe("daily raid summary boss selection", () => {
  it("includes current five-star bosses plus event-specific raid bosses with CPs but not unrelated Megas", () => {
    const result = selectDailyRaidSummaryBosses([
      item(
        "five-star-normal",
        "five-star",
        "Kyogre",
        [
          { boss: "Kyogre", maxUnboostedCp: 2351, maxBoostedCp: 2939, possibleShiny: true },
        ],
      ),
      item(
        "mega-ascension--raid-2026-08-31-slot-mega",
        "mega",
        "Victreebel, Dragonite, Malamar, Latias, Latios",
        [
          { boss: "Mega Victreebel", maxUnboostedCp: 1296, maxBoostedCp: 1620, possibleShiny: true },
          { boss: "Mega Dragonite", maxUnboostedCp: 2167, maxBoostedCp: 2709, possibleShiny: true },
          { boss: "Malamar", maxUnboostedCp: 1344, maxBoostedCp: 1680, possibleShiny: false },
          { boss: "Mega Latias", maxUnboostedCp: 2006, maxBoostedCp: 2507, possibleShiny: true },
          { boss: "Mega Latios", maxUnboostedCp: 2178, maxBoostedCp: 2723, possibleShiny: true },
        ],
      ),
      item("ordinary-mega-gyarados", "mega", "Gyarados"),
    ]);

    expect(result.fiveStarBosses).toEqual([
      { name: "Kyogre", maxUnboostedCp: 2351, maxBoostedCp: 2939 },
    ]);
    expect(result.eventBosses).toEqual([
      { name: "Mega Victreebel", maxUnboostedCp: 1296, maxBoostedCp: 1620 },
      { name: "Mega Dragonite", maxUnboostedCp: 2167, maxBoostedCp: 2709 },
      { name: "Mega Malamar", maxUnboostedCp: 1344, maxBoostedCp: 1680 },
      { name: "Mega Latias", maxUnboostedCp: 2006, maxBoostedCp: 2507 },
      { name: "Mega Latios", maxUnboostedCp: 2178, maxBoostedCp: 2723 },
    ]);
  });

  it("does not repeat event five-star bosses in both sections", () => {
    const eventFiveStar = item(
      "festival--raid-2026-09-05-slot-five-star",
      "five-star",
      "Armored Mewtwo",
      [
        { boss: "Armored Mewtwo", maxUnboostedCp: 1821, maxBoostedCp: 2276, possibleShiny: true },
      ],
    );
    const result = selectDailyRaidSummaryBosses([eventFiveStar]);
    expect(result.fiveStarBosses).toEqual([
      { name: "Armored Mewtwo", maxUnboostedCp: 1821, maxBoostedCp: 2276 },
    ]);
    expect(result.eventBosses).toEqual([]);
  });

  it("ignores next rotations", () => {
    const next = item("future--raid-slot-mega", "mega", "Falinks");
    next.state = "next";
    expect(selectDailyRaidSummaryBosses([next])).toEqual({
      fiveStarBosses: [],
      eventBosses: [],
    });
  });
});

describe("daily raid summary payload", () => {
  it("includes normal and weather-boosted hundo CP for every resolved boss", () => {
    expect(
      buildDailyRaidSummaryPayload(
        "2026-08-31",
        [
          { name: "Kyogre", maxUnboostedCp: 2351, maxBoostedCp: 2939 },
        ],
        [
          { name: "Mega Malamar", maxUnboostedCp: 1344, maxBoostedCp: 1680 },
          { name: "Mega Latias", maxUnboostedCp: 2006, maxBoostedCp: 2507 },
        ],
      ),
    ).toEqual({
      title: "Raid bosses tonight",
      body:
        "5★\n" +
        "Kyogre — Hundo 2351 CP • WB 2939 CP\n" +
        "Event raids\n" +
        "Mega Malamar — Hundo 1344 CP • WB 1680 CP\n" +
        "Mega Latias — Hundo 2006 CP • WB 2507 CP",
      tag: "raid-daily-2026-08-31",
      renotify: false,
      url: "/tools/raids",
    });
  });

  it("shows CP pending instead of dropping a boss with unresolved data", () => {
    const payload = buildDailyRaidSummaryPayload(
      "2026-08-31",
      [],
      [{ name: "Mega Futuremon", maxUnboostedCp: null, maxBoostedCp: null }],
    );
    expect(payload?.body).toContain("Mega Futuremon — CP pending");
  });
});
