import {
  calculateMegaEncounterCp,
  calculatePokemonEncounterCp,
  matchMegaSupplementRecords,
  matchPokemonSupplementRecords,
} from "../../lib/raid-detail-source";
import type { RaidBossTickerItem } from "../../lib/events";

const megaRecords = [
  {
    pokemon_id: 445,
    pokemon_name: "Garchomp",
    mega_name: "Mega Garchomp",
    form: "Normal",
    type: ["Dragon", "Ground"],
  },
  {
    pokemon_id: 6,
    pokemon_name: "Charizard",
    mega_name: "Mega Charizard X",
    form: "X",
    type: ["Fire", "Dragon"],
  },
  {
    pokemon_id: 6,
    pokemon_name: "Charizard",
    mega_name: "Mega Charizard Y",
    form: "Y",
    type: ["Fire", "Flying"],
  },
];

const pokemonRecords = [
  {
    pokemon_id: 792,
    pokemon_name: "Lunala",
    form: "Normal",
    type: ["Psychic", "Ghost"],
  },
  {
    pokemon_id: 791,
    pokemon_name: "Solgaleo",
    form: "Normal",
    type: ["Psychic", "Steel"],
  },
];

function tickerItem(boss: string, category: RaidBossTickerItem["category"] = "mega"): RaidBossTickerItem {
  return {
    eventID: `${category}-${boss}`,
    category,
    label: category === "mega" ? "Mega" : "5★",
    boss,
    start: "2026-08-16T10:00:00.000",
    end: "2026-08-17T10:00:00.000",
    link: null,
  };
}

describe("Mega raid detail fallback", () => {
  it("matches Mega Garchomp directly from the Mega supplement data", () => {
    expect(matchMegaSupplementRecords(tickerItem("Mega Garchomp"), megaRecords)).toEqual([
      megaRecords[0],
    ]);
  });

  it("keeps distinct Mega forms separate", () => {
    expect(matchMegaSupplementRecords(tickerItem("Mega Charizard X"), megaRecords)).toEqual([
      megaRecords[1],
    ]);
    expect(matchMegaSupplementRecords(tickerItem("Mega Charizard Y"), megaRecords)).toEqual([
      megaRecords[2],
    ]);
  });

  it("does not use Mega supplement data for non-Mega raid categories", () => {
    expect(
      matchMegaSupplementRecords(tickerItem("Garchomp", "five-star"), megaRecords),
    ).toEqual([]);
  });

  it("uses the normal form stats for the Mega raid catch encounter", () => {
    const pokemonStats = [
      {
        pokemon_id: 445,
        pokemon_name: "Garchomp",
        form: "Costume",
        base_attack: 1,
        base_defense: 1,
        base_stamina: 1,
      },
      {
        pokemon_id: 445,
        pokemon_name: "Garchomp",
        form: "Normal",
        base_attack: 261,
        base_defense: 193,
        base_stamina: 239,
      },
    ];
    const cpMultipliers = [
      { level: 20, multiplier: 0.5974000096321106 },
      { level: 25, multiplier: 0.667934000492096 },
    ];

    expect(
      calculateMegaEncounterCp(megaRecords[0], pokemonStats, cpMultipliers),
    ).toEqual({
      maxUnboostedCp: 2264,
      maxBoostedCp: 2830,
    });
  });
});

describe("five-star raid detail fallback", () => {
  it("matches Lunala from normal Pokémon data when the raid feed is missing it", () => {
    expect(
      matchPokemonSupplementRecords(tickerItem("Lunala", "five-star"), pokemonRecords),
    ).toEqual([pokemonRecords[0]]);
  });

  it("does not use the normal five-star fallback for Mega raids", () => {
    expect(
      matchPokemonSupplementRecords(tickerItem("Lunala", "mega"), pokemonRecords),
    ).toEqual([]);
  });

  it("calculates Lunala's level 20 and 25 perfect catch CP from its normal stats", () => {
    const pokemonStats = [
      {
        pokemon_id: 792,
        pokemon_name: "Lunala",
        form: "Normal",
        base_attack: 255,
        base_defense: 191,
        base_stamina: 264,
      },
    ];
    const cpMultipliers = [
      { level: 20, multiplier: 0.5974000096321106 },
      { level: 25, multiplier: 0.667934000492096 },
    ];

    expect(
      calculatePokemonEncounterCp(pokemonRecords[0], pokemonStats, cpMultipliers),
    ).toEqual({
      maxUnboostedCp: 2310,
      maxBoostedCp: 2887,
    });
  });
});
