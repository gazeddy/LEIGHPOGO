import {
  buildMegaFallbackProfiles,
  isProvisionalMegaProfileKey,
  type MegaFallbackSourceData,
} from "../../lib/mega-fallback-source";
import type { RaidBossProfileData, RaidBossTickerItem } from "../../lib/events";

function item(boss: string): RaidBossTickerItem {
  return {
    eventID: `future-mega-${boss}`,
    category: "mega",
    label: "Mega",
    boss,
    start: "2026-08-31T10:00:00.000",
    end: "2026-09-01T00:00:00.000",
    link: null,
  };
}

function source(megaPokemon: MegaFallbackSourceData["megaPokemon"] = []): MegaFallbackSourceData {
  return {
    checkedAt: "2026-08-31T09:00:00.000Z",
    pokemonTypes: [
      {
        pokemon_id: 999,
        pokemon_name: "Futuremon",
        form: "Normal",
        type: ["Water"],
      },
    ],
    pokemonStats: [
      {
        pokemon_id: 999,
        pokemon_name: "Futuremon",
        form: "Normal",
        base_attack: 100,
        base_defense: 100,
        base_stamina: 100,
      },
    ],
    cpMultipliers: [
      { level: 20, multiplier: 0.5974000096321106 },
      { level: 25, multiplier: 0.667934000492096 },
    ],
    megaPokemon,
    effectiveness: {
      Electric: { Water: 1.6, Dragon: 0.625 },
      Grass: { Water: 1.6, Dragon: 0.625 },
      Dragon: { Water: 1, Dragon: 1.6 },
      Fire: { Water: 0.625, Dragon: 0.625 },
    },
    weatherBoosts: {
      Rainy: ["Water"],
      Windy: ["Dragon"],
    },
  };
}

describe("generic Mega raid fallback", () => {
  it("builds a clearly provisional profile from base Pokémon data when the Mega is absent", () => {
    const profiles = buildMegaFallbackProfiles(
      item("Futuremon"),
      [],
      source(),
      "2026-08-31T09:30:00.000Z",
    );

    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toMatchObject({
      name: "Futuremon",
      category: "mega",
      tier: "mega-provisional",
      types: ["Water"],
      maxUnboostedCp: 471,
      maxBoostedCp: 590,
      possibleShiny: null,
    });
    expect(isProvisionalMegaProfileKey(profiles[0].key)).toBe(true);
    expect(profiles[0].weaknesses).toContainEqual({ type: "Electric", multiplier: 1.6 });
  });

  it("uses official Mega typing and drops the provisional marker once PoGoAPI has a Mega record", () => {
    const profiles = buildMegaFallbackProfiles(
      item("Futuremon"),
      [],
      source([
        {
          pokemon_id: 999,
          pokemon_name: "Futuremon",
          mega_name: "Mega Futuremon",
          form: "Normal",
          type: ["Water", "Dragon"],
        },
      ]),
      "2026-08-31T09:30:00.000Z",
    );

    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toMatchObject({
      name: "Futuremon",
      category: "mega",
      tier: "mega",
      types: ["Water", "Dragon"],
      maxUnboostedCp: 471,
      maxBoostedCp: 590,
    });
    expect(isProvisionalMegaProfileKey(profiles[0].key)).toBe(false);
    expect(profiles[0].boostedWeather).toEqual(["Rainy", "Windy"]);
  });

  it("does not create a fallback card for a boss already covered by primary Mega raid data", () => {
    const existing: RaidBossProfileData = {
      key: "mega|futuremon|normal|mega",
      category: "mega",
      name: "Mega Futuremon",
      pokemonId: 999,
      form: "Normal",
      tier: "mega",
      types: ["Water", "Dragon"],
      weaknesses: [],
      resistances: [],
      boostedWeather: [],
      maxUnboostedCp: 471,
      maxBoostedCp: 590,
      possibleShiny: true,
      refreshedAt: "2026-08-31T09:30:00.000Z",
    };

    expect(buildMegaFallbackProfiles(item("Futuremon"), [existing], source())).toEqual([]);
  });

  it("does not mistake an old same-name non-Mega raid profile for official Mega data", () => {
    const existing: RaidBossProfileData = {
      key: "mega|futuremon|normal|5",
      category: "mega",
      name: "Futuremon",
      pokemonId: 999,
      form: "Normal",
      tier: "5",
      types: ["Water"],
      weaknesses: [],
      resistances: [],
      boostedWeather: [],
      maxUnboostedCp: 471,
      maxBoostedCp: 590,
      possibleShiny: true,
      refreshedAt: "2026-08-31T09:30:00.000Z",
    };

    const profiles = buildMegaFallbackProfiles(item("Futuremon"), [existing], source());
    expect(profiles).toHaveLength(1);
    expect(isProvisionalMegaProfileKey(profiles[0].key)).toBe(true);
  });

  it("keeps simultaneous provisional Mega forms distinct", () => {
    const profiles = buildMegaFallbackProfiles(
      item("Futuremon X, Futuremon Y"),
      [],
      source(),
      "2026-08-31T09:30:00.000Z",
    );

    expect(profiles).toHaveLength(2);
    expect(profiles.map((profile) => profile.name)).toEqual(["Futuremon X", "Futuremon Y"]);
    expect(new Set(profiles.map((profile) => profile.key)).size).toBe(2);
    expect(profiles.every((profile) => isProvisionalMegaProfileKey(profile.key))).toBe(true);
  });
});
