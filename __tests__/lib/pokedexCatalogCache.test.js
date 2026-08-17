const {
  buildAuthoritativeNamesPayload,
  sitePokedexHash,
  validateCache,
} = require("../../lib/pokedexCatalogCache");

function makePokemon(count, includeResources = true) {
  return Object.fromEntries(
    Array.from({ length: count }, (_, index) => {
      const dexNumber = index + 1;
      return [
        dexNumber,
        {
          name: `Pokemon ${dexNumber}`,
          types: [],
          buddyDistance: includeResources ? 3 : null,
          secondMoveCost: includeResources
            ? { stardust: 50000, candy: 50 }
            : null,
          megaEvolutions:
            includeResources && dexNumber <= 25
              ? [
                  {
                    megaName: `Mega Pokemon ${dexNumber}`,
                    form: null,
                    firstTimeEnergy: 200,
                    repeatEnergy: 40,
                    types: [],
                  },
                ]
              : [],
          previous: [],
          next: [],
        },
      ];
    })
  );
}

function makeCache(version = 6, includeResources = true) {
  return {
    version,
    checkedAt: "2026-08-02T20:00:00.000Z",
    sourceHashes: { site_pokedex: sitePokedexHash(), source: "hash" },
    data: {
      regions: [],
      pokemon: makePokemon(135, includeResources),
    },
  };
}

describe("Pokédex catalog cache validation", () => {
  test("accepts a complete version 6 catalog", () => {
    expect(validateCache(makeCache())).not.toBeNull();
  });

  test("rejects the previous cache version", () => {
    expect(validateCache(makeCache(5))).toBeNull();
  });

  test("rejects a cache built from a different site Pokédex list", () => {
    const cache = makeCache();
    cache.sourceHashes.site_pokedex = "stale-site-list";
    expect(validateCache(cache)).toBeNull();
  });

  test("uses the maintained site Pokédex for authoritative names", () => {
    const names = buildAuthoritativeNamesPayload();

    expect(names[1]).toEqual({ id: 1, name: "Bulbasaur" });
    expect(names[1025]).toEqual({ id: 1025, name: "Pecharunt" });
    expect(Object.keys(names)).toHaveLength(1025);
  });

  test("rejects a catalog whose resource fields are all missing", () => {
    expect(validateCache(makeCache(6, false))).toBeNull();
  });
});
