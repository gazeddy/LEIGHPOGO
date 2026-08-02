const {
  buildPokedexCatalog,
  regionForDexNumber,
} = require("../../lib/pokedexCatalog");

describe("POGOAPI Pokédex catalog", () => {
  const names = Object.fromEntries(
    Array.from({ length: 135 }, (_, index) => {
      const id = index + 1;
      return [id, { id, name: `Pokemon ${id}` }];
    })
  );
  Object.assign(names, {
    1: { id: 1, name: "Bulbasaur" },
    2: { id: 2, name: "Ivysaur" },
    3: { id: 3, name: "Venusaur" },
    67: { id: 67, name: "Machoke" },
    68: { id: 68, name: "Machamp" },
    133: { id: 133, name: "Eevee" },
    134: { id: 134, name: "Vaporeon" },
    135: { id: 135, name: "Jolteon" },
  });

  const types = [
    { pokemon_id: 1, pokemon_name: "Bulbasaur", type: ["Grass", "Poison"] },
    { pokemon_id: 2, pokemon_name: "Ivysaur", type: ["Grass", "Poison"] },
    { pokemon_id: 3, pokemon_name: "Venusaur", form: "Mega", type: ["Grass", "Poison"] },
    { pokemon_id: 3, pokemon_name: "Venusaur", form: "Normal", type: ["Grass", "Poison"] },
    { pokemon_id: 133, pokemon_name: "Eevee", type: ["Normal"] },
  ];

  const evolutions = [
    {
      pokemon_id: 1,
      pokemon_name: "Bulbasaur",
      evolutions: [
        { pokemon_id: 2, pokemon_name: "Ivysaur", candy_required: 25 },
      ],
    },
    {
      pokemon_id: 2,
      pokemon_name: "Ivysaur",
      evolutions: [
        { pokemon_id: 3, pokemon_name: "Venusaur", candy_required: 100 },
      ],
    },
    {
      pokemon_id: 67,
      pokemon_name: "Machoke",
      evolutions: [
        {
          pokemon_id: 68,
          pokemon_name: "Machamp",
          candy_required: 100,
          no_candy_cost_if_traded: true,
        },
      ],
    },
    {
      pokemon_id: 133,
      pokemon_name: "Eevee",
      evolutions: [
        { pokemon_id: 134, pokemon_name: "Vaporeon", candy_required: 25 },
        { pokemon_id: 135, pokemon_name: "Jolteon", candy_required: 25 },
      ],
    },
  ];

  test("creates previous and next links by evolution stage", () => {
    const catalog = buildPokedexCatalog(names, types, evolutions);

    expect(catalog.pokemon[1].previous).toEqual([]);
    expect(catalog.pokemon[1].next).toEqual([
      expect.objectContaining({ pokemonId: 2, candyRequired: 25 }),
    ]);

    expect(catalog.pokemon[2].previous).toEqual([
      expect.objectContaining({ pokemonId: 1, candyRequired: 25 }),
    ]);
    expect(catalog.pokemon[2].next).toEqual([
      expect.objectContaining({ pokemonId: 3, candyRequired: 100 }),
    ]);

    expect(catalog.pokemon[3].previous).toEqual([
      expect.objectContaining({ pokemonId: 2, candyRequired: 100 }),
    ]);
    expect(catalog.pokemon[3].next).toEqual([]);
  });

  test("keeps every branch of a branching evolution", () => {
    const catalog = buildPokedexCatalog(names, types, evolutions);
    expect(catalog.pokemon[133].next).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ pokemonId: 134, candyRequired: 25 }),
        expect.objectContaining({ pokemonId: 135, candyRequired: 25 }),
      ])
    );
  });

  test("keeps the zero Candy after trade flag in both directions", () => {
    const catalog = buildPokedexCatalog(names, types, evolutions);

    expect(catalog.pokemon[67].next).toEqual([
      expect.objectContaining({
        pokemonId: 68,
        candyRequired: 100,
        noCandyCostIfTraded: true,
      }),
    ]);
    expect(catalog.pokemon[68].previous).toEqual([
      expect.objectContaining({
        pokemonId: 67,
        candyRequired: 100,
        noCandyCostIfTraded: true,
      }),
    ]);
  });

  test("uses the normal form typing for a National Dex card", () => {
    const catalog = buildPokedexCatalog(names, types, evolutions);
    expect(catalog.pokemon[3].types).toEqual(["Grass", "Poison"]);
  });

  test("keeps the existing regional ordering rules", () => {
    expect(regionForDexNumber(151)).toBe("Kanto");
    expect(regionForDexNumber(808)).toBe("Unknown");
    expect(regionForDexNumber(810)).toBe("Galar");
    expect(regionForDexNumber(899)).toBe("Hisui");
    expect(regionForDexNumber(906)).toBe("Paldea");
    expect(regionForDexNumber(1026)).toBe("Other");
  });
});
