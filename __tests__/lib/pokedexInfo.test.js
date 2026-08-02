const {
  buildPokedexInfo,
  calculateMatchups,
  formatEvolutionRequirement,
} = require("../../lib/pokedexInfo");

describe("Pokédex information normalisation", () => {
  const effectiveness = {
    Electric: { Flying: "1.6", Water: "1.6", Ground: "0.390625" },
    Fighting: { Normal: "1.6", Flying: "0.625" },
    Ghost: { Normal: "0.390625", Flying: "1" },
    Grass: { Water: "1.6", Ground: "1.6", Flying: "0.625" },
    Rock: { Flying: "1.6", Water: "1" },
  };

  test("combines defensive multipliers for dual typings", () => {
    const matchups = calculateMatchups(["Water", "Flying"], effectiveness);

    expect(matchups.weaknesses).toContainEqual({
      type: "Electric",
      multiplier: 2.5600000000000005,
    });
    expect(matchups.resistances).toContainEqual({
      type: "Fighting",
      multiplier: 0.625,
    });
  });

  test("uses the normal form for the main National Dex typing", () => {
    const result = buildPokedexInfo(
      [
        { pokemon_id: 19, form: "Alola", type: ["Dark", "Normal"] },
        { pokemon_id: 19, form: "Normal", type: ["Normal"] },
      ],
      effectiveness,
      []
    );

    expect(result.pokemon[19].types).toEqual(["Normal"]);
  });

  test("links Eevee branches and keeps their evolution requirements", () => {
    const result = buildPokedexInfo(
      [{ pokemon_id: 133, form: "Normal", type: ["Normal"] }],
      effectiveness,
      [
        {
          pokemon_id: 133,
          pokemon_name: "Eevee",
          form: "Normal",
          evolutions: [
            {
              pokemon_id: 134,
              pokemon_name: "Vaporeon",
              form: "Normal",
              candy_required: 25,
            },
            {
              pokemon_id: 135,
              pokemon_name: "Jolteon",
              form: "Normal",
              candy_required: 25,
            },
            {
              pokemon_id: 196,
              pokemon_name: "Espeon",
              form: "Normal",
              candy_required: 25,
              buddy_distance_required: 10,
              must_be_buddy_to_evolve: true,
              only_evolves_in_daytime: true,
              priority: 100,
            },
          ],
        },
      ]
    );

    expect(result.pokemon[133].evolvesTo).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pokemonId: 134,
          randomOutcome: true,
          requirements: ["25 Candy"],
        }),
        expect.objectContaining({
          pokemonId: 196,
          randomOutcome: false,
          requirements: expect.arrayContaining([
            "25 Candy",
            "Walk 10 km as your buddy",
            "Must be your current buddy",
            "Evolve during daytime",
          ]),
        }),
      ])
    );
    expect(result.pokemon[196].evolvesFrom).toEqual(
      expect.arrayContaining([expect.objectContaining({ pokemonId: 133 })])
    );
  });

  test("formats supported and future evolution requirement fields", () => {
    expect(formatEvolutionRequirement("item_required", "Sinnoh Stone")).toBe(
      "Use Sinnoh Stone"
    );
    expect(formatEvolutionRequirement("gender_required", "Female")).toBe("Female only");
    expect(formatEvolutionRequirement("adventure_hearts_required", 70)).toBe(
      "Adventure Hearts: 70"
    );
  });
});
