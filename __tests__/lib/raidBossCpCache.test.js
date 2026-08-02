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
        name: "Heatran",
        form: "Normal",
        max_unboosted_cp: 2145,
        max_boosted_cp: 2681,
        possible_shiny: true,
      },
    ],
    mega: [
      {
        name: "Sableye",
        form: "Normal",
        max_unboosted_cp: 1110,
        max_boosted_cp: 1387,
        possible_shiny: true,
      },
    ],
  },
  previous: {
    3: [
      {
        name: "Aggron",
        form: "Normal",
        max_unboosted_cp: 1714,
        max_boosted_cp: 2143,
        possible_shiny: false,
      },
    ],
    5: [
      {
        name: "Kyurem",
        form: "Normal",
        max_unboosted_cp: 2042,
        max_boosted_cp: 2553,
        possible_shiny: true,
      },
      {
        name: "Palkia",
        form: "Normal",
        max_unboosted_cp: 2280,
        max_boosted_cp: 2850,
        min_unboosted_cp: 2190,
        min_boosted_cp: 2737,
        possible_shiny: true,
      },
      {
        name: "Uxie",
        form: "Normal",
        max_unboosted_cp: 1442,
        max_boosted_cp: 1803,
        possible_shiny: true,
      },
      {
        name: "Mesprit",
        form: "Normal",
        max_unboosted_cp: 1747,
        max_boosted_cp: 2184,
        possible_shiny: false,
      },
      {
        name: "Azelf",
        form: "Normal",
        max_unboosted_cp: 1834,
        max_boosted_cp: 2293,
        possible_shiny: true,
      },
      {
        name: "Dialga",
        form: "Origin",
        max_unboosted_cp: 2337,
        max_boosted_cp: 2921,
        possible_shiny: true,
      },
    ],
    mega: [
      {
        name: "Aggron",
        form: "Normal",
        tier: 6,
        max_unboosted_cp: 2378,
        max_boosted_cp: 2973,
        possible_shiny: true,
      },
    ],
  },
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
  it("uses previous records when PoGoAPI current lags the event feed", () => {
    const bosses = extractCurrentRaidBosses(pogoApiPayload);

    expect(
      findRaidBossCpMatches(tickerItem("five-star", "Kyurem"), bosses),
    ).toEqual([
      {
        boss: "Kyurem",
        maxUnboostedCp: 2042,
        maxBoostedCp: 2553,
        possibleShiny: true,
      },
    ]);
  });

  it("extracts maximum CP and shiny availability while excluding minimum CP", () => {
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
      possibleShiny: true,
    });
    expect(palkia).not.toHaveProperty("minUnboostedCp");
    expect(palkia).not.toHaveProperty("minBoostedCp");
  });

  it("keeps false possible_shiny values false", () => {
    const bosses = extractCurrentRaidBosses(pogoApiPayload);
    const mesprit = bosses.find(
      (boss) => boss.name === "Mesprit" && boss.tier === "5",
    );

    expect(mesprit?.possibleShiny).toBe(false);
  });

  it("uses the previous Mega record rather than ordinary Aggron CP", () => {
    const bosses = extractCurrentRaidBosses(pogoApiPayload);

    expect(
      findRaidBossCpMatches(tickerItem("mega", "Aggron"), bosses),
    ).toEqual([
      {
        boss: "Aggron",
        maxUnboostedCp: 2378,
        maxBoostedCp: 2973,
        possibleShiny: true,
      },
    ]);
  });

  it("matches five-star, Shadow and Mega ticker entries without requiring a Shadow tier", () => {
    const bosses = extractCurrentRaidBosses(pogoApiPayload);
    const items = attachRaidBossCp(
      [
        tickerItem("five-star", "Kyurem"),
        tickerItem("shadow", "Palkia"),
        tickerItem("mega", "Aggron"),
      ],
      bosses,
    );

    expect(items[0].catchCp).toEqual([
      {
        boss: "Kyurem",
        maxUnboostedCp: 2042,
        maxBoostedCp: 2553,
        possibleShiny: true,
      },
    ]);
    expect(items[1].catchCp).toEqual([
      {
        boss: "Palkia",
        maxUnboostedCp: 2280,
        maxBoostedCp: 2850,
        possibleShiny: true,
      },
    ]);
    expect(items[2].catchCp).toEqual([
      {
        boss: "Aggron",
        maxUnboostedCp: 2378,
        maxBoostedCp: 2973,
        possibleShiny: true,
      },
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
        possibleShiny: true,
      },
    ]);
  });

  it("returns CP and shiny availability for every boss in a shared raid rotation", () => {
    const bosses = extractCurrentRaidBosses(pogoApiPayload);
    const matches = findRaidBossCpMatches(
      tickerItem("five-star", "Uxie, Mesprit, and Azelf"),
      bosses,
    );

    expect(matches).toEqual([
      {
        boss: "Uxie",
        maxUnboostedCp: 1442,
        maxBoostedCp: 1803,
        possibleShiny: true,
      },
      {
        boss: "Mesprit",
        maxUnboostedCp: 1747,
        maxBoostedCp: 2184,
        possibleShiny: false,
      },
      {
        boss: "Azelf",
        maxUnboostedCp: 1834,
        maxBoostedCp: 2293,
        possibleShiny: true,
      },
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
