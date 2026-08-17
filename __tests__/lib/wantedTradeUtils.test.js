const {
  buildEffectiveReleasedPokemonOptions,
  validateWantedTradePayload,
} = require("../../lib/wantedTradeUtils")

const pokedexByRegion = [
  {
    name: "Galar",
    pokemon: [
      { dexNumber: 843, name: "Silicobra" },
      { dexNumber: 844, name: "Sandaconda" },
    ],
  },
]

describe("wanted trade effective Pokémon availability", () => {
  test("includes a Pokémon manually marked released even when POGOAPI says unreleased", () => {
    const options = buildEffectiveReleasedPokemonOptions(
      pokedexByRegion,
      [],
      [{ dexNumber: 843, released: true }],
    )

    expect(options).toEqual([{ dexNumber: 843, name: "Silicobra" }])
    expect(validateWantedTradePayload({ dexNumber: 843 }, options).error).toBeUndefined()
  })

  test("excludes a Pokémon manually marked unreleased even when POGOAPI says released", () => {
    const options = buildEffectiveReleasedPokemonOptions(
      pokedexByRegion,
      [843, 844],
      [{ dexNumber: 843, released: false }],
    )

    expect(options).toEqual([{ dexNumber: 844, name: "Sandaconda" }])
    expect(validateWantedTradePayload({ dexNumber: 843 }, options)).toEqual({
      error: "Select a released Pokémon from the list.",
    })
  })
})
