const fs = require("fs")
const path = require("path")

const read = (...parts) =>
  fs.readFileSync(path.join(process.cwd(), ...parts), "utf8")

describe("Pokédex missing and wanted integration", () => {
  const pokedexPage = read("pages", "pokedex.js")
  const pokedexApi = read("pages", "api", "pokedex.js")
  const wantedApi = read("pages", "api", "trades", "wanted", "index.js")

  test("offers an available-only missing Pokédex view", () => {
    expect(pokedexPage).toContain('<option value="MISSING" disabled={!catalog?.availabilityKnown}>')
    expect(pokedexPage).toContain("Missing (available only)")
    expect(pokedexPage).toContain('viewMode === "MISSING"')
    expect(pokedexPage).toContain("releasedSet.has(pokemon.dexNumber)")
    expect(pokedexPage).toContain("caughtSet.has(pokemon.dexNumber)")
  })

  test("loads the current trainer's wanted Pokémon and supports one-tap wanted adds", () => {
    expect(pokedexPage).toContain('fetch("/api/trades/wanted?mine=1")')
    expect(pokedexPage).toContain('fetch("/api/trades/wanted", {')
    expect(pokedexPage).toContain('method: "POST"')
    expect(pokedexPage).toContain('body: JSON.stringify({ dexNumber: pokemon.dexNumber })')
    expect(pokedexPage).toContain('"+ Wanted"')
    expect(wantedApi).toContain('String(req.query?.mine || "") === "1"')
    expect(wantedApi).toContain("where: onlyCurrentUser ? { ownerId: currentUser.id } : undefined")
  })

  test("removes only plain wanted listings when a Pokémon changes from missing to caught", () => {
    expect(pokedexApi).toContain("const previousEntries = await tx.pokedexEntry.findMany")
    expect(pokedexApi).toContain("const newlyCaughtDexNumbers = dexNumbers.filter")
    expect(pokedexApi).toContain("!previouslyCaught.has(dexNumber)")
    expect(pokedexApi).toContain("for (const chunk of chunkDexNumbers(newlyCaughtDexNumbers))")
    expect(pokedexApi).toContain("await tx.wantedTrade.deleteMany")
    expect(pokedexApi).toContain("shiny: false")
    expect(pokedexApi).toContain("lucky: false")
    expect(pokedexApi).toContain("xxl: false")
    expect(pokedexApi).toContain("costume: false")
    expect(pokedexApi).toContain("gigantamax: false")
    expect(pokedexApi).toContain("removedWantedCount += removed.count")
    expect(pokedexPage).toContain("data.newlyCaughtDexNumbers")
    expect(pokedexPage).toContain("data.removedWantedCount")
  })
})
