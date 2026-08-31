import {
  buildDailyRaidSummaryPayload,
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

describe("daily raid summary boss selection", () => {
  it("includes current five-star bosses plus event-specific raid bosses but not unrelated Megas", () => {
    const result = selectDailyRaidSummaryBosses([
      item("five-star-normal", "five-star", "Kyogre"),
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

    expect(result.fiveStarBosses).toEqual(["Kyogre"]);
    expect(result.eventBosses).toEqual([
      "Mega Victreebel",
      "Mega Dragonite",
      "Mega Malamar",
      "Mega Latias",
      "Mega Latios",
    ]);
  });

  it("does not repeat event five-star bosses in both lines", () => {
    const eventFiveStar = item(
      "festival--raid-2026-09-05-slot-five-star",
      "five-star",
      "Armored Mewtwo",
    );
    const result = selectDailyRaidSummaryBosses([eventFiveStar]);
    expect(result.fiveStarBosses).toEqual(["Armored Mewtwo"]);
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
  it("builds a compact notification linking to raid tools", () => {
    expect(
      buildDailyRaidSummaryPayload(
        "2026-08-31",
        ["Kyogre"],
        ["Mega Malamar", "Mega Latias"],
      ),
    ).toEqual({
      title: "Raid bosses tonight",
      body: "5★: Kyogre\nEvent: Mega Malamar, Mega Latias",
      tag: "raid-daily-2026-08-31",
      renotify: false,
      url: "/tools/raids",
    });
  });
});
