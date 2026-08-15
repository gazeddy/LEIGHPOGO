const fs = require("fs")
const path = require("path")

const read = (...parts) =>
  fs.readFileSync(path.join(process.cwd(), ...parts), "utf8")

describe("caught Pokédex persistence", () => {
  const pokedexApi = read("pages", "api", "pokedex.js")

  test("keeps caught progress independent of changing release metadata", () => {
    expect(pokedexApi).not.toContain("getReleasedPokemonData")
    expect(pokedexApi).not.toContain("filterReleasedDexNumbers")
    expect(pokedexApi).not.toContain("readPokemonAvailabilityOverrides")
    expect(pokedexApi).toContain("normaliseDexNumbers")
    expect(pokedexApi).toContain("replacePokedexEntries(ownerId, dexNumbers)")
  })

  test("does not allow caught progress responses to be cached", () => {
    expect(pokedexApi).toContain("private, no-store, no-cache, must-revalidate")
    expect(pokedexApi).toContain('res.setHeader("CDN-Cache-Control", "no-store")')
    expect(pokedexApi).toContain('res.setHeader("Pragma", "no-cache")')
  })
})
