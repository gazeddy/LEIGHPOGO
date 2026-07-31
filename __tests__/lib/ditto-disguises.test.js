const fs = require("fs")
const path = require("path")
const {
  isDittoCacheForHash,
  normaliseDittoDisguises,
} = require("../../lib/ditto-disguises")

describe("Ditto disguise helpers", () => {
  it("normalises, sorts and de-duplicates the PoGoAPI object payload", () => {
    expect(
      normaliseDittoDisguises({
        50: { id: 50, name: "Diglett" },
        bad: { id: "not-a-number", name: "MissingNo" },
        duplicate: { id: 50, name: "Diglett" },
        19: { id: "19", name: "Rattata" },
      }),
    ).toEqual([
      { id: 19, name: "Rattata" },
      { id: 50, name: "Diglett" },
    ])
  })

  it("keeps the cached dataset only while its PoGoAPI hash is unchanged", () => {
    expect(isDittoCacheForHash("same-hash", "same-hash")).toBe(true)
    expect(isDittoCacheForHash("old-hash", "new-hash")).toBe(false)
    expect(isDittoCacheForHash(null, "new-hash")).toBe(false)
  })

  it("uses the shared daily hash manifest instead of ScrapedDuck seasons", () => {
    const serverSource = fs.readFileSync(
      path.join(process.cwd(), "lib/ditto-disguises-server.ts"),
      "utf8",
    )

    expect(serverSource).toContain(
      "getPogoApiFileHash(DITTO_API_FILENAME)",
    )
    expect(serverSource).toContain(
      'const DITTO_API_FILENAME = "possible_ditto_pokemon.json"',
    )
    expect(serverSource).toContain("isDittoCacheForHash")
    expect(serverSource).toContain("!cache.sourceHash")
    expect(serverSource).not.toContain("getCurrentPokemonGoSeason")
    expect(serverSource).not.toContain("ScrapedDuck did not provide")
  })

  it("stores a successful PoGoAPI response in memory before writing the file cache", () => {
    const serverSource = fs.readFileSync(
      path.join(process.cwd(), "lib/ditto-disguises-server.ts"),
      "utf8",
    )
    const memoryAssignment = serverSource.indexOf("memoryCache = cache")
    const diskWrite = serverSource.indexOf("await writeDittoCache(cache)")

    expect(serverSource).toContain("if (memoryCache)")
    expect(memoryAssignment).toBeGreaterThan(-1)
    expect(diskWrite).toBeGreaterThan(memoryAssignment)
    expect(serverSource).toContain("Failed to persist Ditto disguise cache")
  })
})
