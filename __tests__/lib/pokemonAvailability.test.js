const {
  applyPokemonAvailabilityOverrides,
  sortPokemonAvailabilityRows,
} = require("../../lib/pokemonAvailability");

describe("Pokémon availability overrides", () => {
  test("applies released and unreleased overrides to the POGOAPI set", () => {
    expect(
      applyPokemonAvailabilityOverrides([1, 2, 3], [
        { dexNumber: 2, released: false },
        { dexNumber: 4, released: true },
      ])
    ).toEqual([1, 3, 4]);
  });

  test("sorts effective unreleased Pokémon first", () => {
    const rows = [
      { dexNumber: 1, effectiveReleased: true },
      { dexNumber: 3, effectiveReleased: false },
      { dexNumber: 2, effectiveReleased: false },
    ];

    expect(
      sortPokemonAvailabilityRows(rows, "unreleased").map(
        (row) => row.dexNumber
      )
    ).toEqual([2, 3, 1]);
    expect(
      sortPokemonAvailabilityRows(rows, "released").map(
        (row) => row.dexNumber
      )
    ).toEqual([1, 2, 3]);
    expect(
      sortPokemonAvailabilityRows(rows, "dex").map((row) => row.dexNumber)
    ).toEqual([1, 2, 3]);
  });
});
