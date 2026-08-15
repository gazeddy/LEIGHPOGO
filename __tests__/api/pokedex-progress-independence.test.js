const fs = require("fs")
const path = require("path")

const source = fs.readFileSync(
  path.join(process.cwd(), "pages", "api", "pokedex.js"),
  "utf8"
)

describe("Pokédex progress persistence", () => {
  test("does not depend on the external released Pokémon feed", () => {
    expect(source).not.toContain("getReleasedPokemonData")
    expect(source).not.toContain("filterReleasedDexNumbers")
    expect(source).not.toContain("readPokemonAvailabilityOverrides")
  })

  test("normalises saved dex numbers locally and keeps chunked writes", () => {
    expect(source).toContain("normaliseDexNumbers")
    expect(source).toContain("MAX_REASONABLE_DEX_NUMBER")
    expect(source).toContain("POKEDEX_WRITE_CHUNK_SIZE = 250")
    expect(source).toContain("tx.pokedexEntry.createMany")
    expect(source).toContain("replacePokedexEntries(ownerId, dexNumbers)")
  })

  test("normalises the authenticated user id before database writes", () => {
    expect(source).toContain("const ownerId = Number(session.user.id)")
    expect(source).toContain("Number.isInteger(ownerId)")
  })
})
