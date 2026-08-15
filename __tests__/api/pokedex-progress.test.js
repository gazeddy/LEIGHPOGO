const fs = require("fs")
const path = require("path")

const read = (...parts) =>
  fs.readFileSync(path.join(process.cwd(), ...parts), "utf8")

describe("caught Pokédex persistence", () => {
  const pokedexApi = read("pages", "api", "pokedex.js")

  test("uses the same admin-adjusted release status as the Pokédex catalog", () => {
    expect(pokedexApi).toContain("applyPokemonAvailabilityOverrides")
    expect(pokedexApi).toContain("readPokemonAvailabilityOverrides")
    expect(pokedexApi).toContain("releasedPokemonData.dexNumbers")
    expect(pokedexApi).toContain("overrideResult.overrides")
  })

  test("does not allow caught progress responses to be cached", () => {
    expect(pokedexApi).toContain("private, no-store, no-cache, must-revalidate")
    expect(pokedexApi).toContain('res.setHeader("CDN-Cache-Control", "no-store")')
    expect(pokedexApi).toContain('res.setHeader("Pragma", "no-cache")')
  })
})
