const {
  attachRaidBossCp,
  extractCurrentRaidBosses,
  findRaidBossCpMatches,
  normaliseBossName,
} = require("../../lib/raidBossCpCache");

const pogoApiPayload = {
  current: {
    5: [
      {
        name: "Palkia",
        form: "Normal",
        tier: 5,
        max_unboosted_cp: 2280,
        max_boosted_cp: 2850,
        min_unboosted_cp: 2190,
        min_boosted_cp: 2737,
      },
      {
        name: "Uxie",
        form: "Normal",
        max_unboosted_cp: 1442,
        max_boosted_cp: 1803,
      },
      {
        name: "Mesprit",
        form: "Normal",
        max_unboosted_cp: 1747,
        max_boosted_cp: 2184,
      },
      {
        name: "Azelf",
        form: "Normal",
        max_unboosted_cp: 1834,
        max_boosted_cp: 2293,
      },
      {
        name: "Dialga",
        form: "Origin",
        max_unboosted_cp: 2337,
        max_boosted_cp: 2921,
      },
    ],
    mega: [
      {
        name: "Aggron",
        form: "Normal",
        tier: 6,
        max_unboosted_cp: 1714,
        max_boosted_cp: 2143,
      },
    ],
  },
  previous: {},
};

function tickerItem(category, boss) {
  return {
    eventID: `${category}-${boss}`,
    category,
    label:
      category === "five-star"
        ? "5★"
        : category === "shadow"
          ? "Shadow"
          : "Mega",
    boss,
    end: "2026-08-04T22:00:00.000",
    link: null,
  };
}

describe("raid boss max catch CP cache", () => {
  it("extracts only the current maximum boosted and unboosted CP values", () => {
    const bosses = extractCurrentRaidBosses(pogoApiPayload);
    const palkia = bosses.find(
      (boss) => boss.name === "Palkia" && boss.tier === "5",
    );

    expect(palkia).toEqual({
      name: "Palkia",
      form: "Normal",
      tier: "5",
      maxUnboostedCp: 2280,
      maxBoostedCp: 2850,
    });
    expect(palkia).not.toHaveProperty("minUnboostedCp");
    expect(palkia).not.toHaveProperty("minBoostedCp");
  });

  it("uses the containing mega key instead of an entry's numeric tier", () => {
    const bosses = extractCurrentRaidBosses(pogoApiPayload);

    expect(bosses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Aggron",
          tier: "mega",
          maxUnboostedCp: 1714,
          maxBoostedCp: 2143,
        }),
      ]),
    );
  });

  it("matches five-star, Shadow and Mega ticker entries without requiring a Shadow tier", () => {
    const bosses = extractCurrentRaidBosses(pogoApiPayload);
    const items = attachRaidBossCp(
      [
        tickerItem("five-star", "Palkia"),
        tickerItem("shadow", "Palkia"),
        tickerItem("mega", "Aggron"),
      ],
      bosses,
    );

    expect(items[0].catchCp).toEqual([
      { boss: "Palkia", maxUnboostedCp: 2280, maxBoostedCp: 2850 },
    ]);
    expect(items[1].catchCp).toEqual([
      { boss: "Palkia", maxUnboostedCp: 2280, maxBoostedCp: 2850 },
    ]);
    expect(items[2].catchCp).toEqual([
      { boss: "Aggron", maxUnboostedCp: 1714, maxBoostedCp: 2143 },
    ]);
  });

  it("matches named forms from the event feed to PoGoAPI forms", () => {
    const bosses = extractCurrentRaidBosses(pogoApiPayload);

    expect(
      findRaidBossCpMatches(
        tickerItem("five-star", "Origin Forme Dialga"),
        bosses,
      ),
    ).toEqual([
      {
        boss: "Origin Dialga",
        maxUnboostedCp: 2337,
        maxBoostedCp: 2921,
      },
    ]);
  });

  it("returns a CP entry for every boss in a shared raid rotation", () => {
    const bosses = extractCurrentRaidBosses(pogoApiPayload);
    const matches = findRaidBossCpMatches(
      tickerItem("five-star", "Uxie, Mesprit, and Azelf"),
      bosses,
    );

    expect(matches).toEqual([
      { boss: "Uxie", maxUnboostedCp: 1442, maxBoostedCp: 1803 },
      { boss: "Mesprit", maxUnboostedCp: 1747, maxBoostedCp: 2184 },
      { boss: "Azelf", maxUnboostedCp: 1834, maxBoostedCp: 2293 },
    ]);
  });

  it("normalises category and form wording without changing boss identity", () => {
    expect(normaliseBossName("Shadow Palkia")).toBe("palkia");
    expect(normaliseBossName("Origin Forme Dialga")).toBe("origin dialga");
    expect(normaliseBossName("Mega Charizard X")).toBe("charizard x");
  });

  it("leaves an unmatched ticker item usable without CP data", () => {
    const item = tickerItem("five-star", "Unknown Boss");

    expect(
      attachRaidBossCp([item], extractCurrentRaidBosses(pogoApiPayload)),
    ).toEqual([item]);
  });
});
