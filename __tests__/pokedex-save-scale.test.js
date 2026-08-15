const fs = require("fs")
const path = require("path")

const source = fs.readFileSync(
  path.join(process.cwd(), "pages", "api", "pokedex.js"),
  "utf8"
)

describe("Pokédex progress saving", () => {
  test("rebuilds progress in bounded chunks instead of one large NOT IN query", () => {
    expect(source).toContain("const POKEDEX_WRITE_CHUNK_SIZE = 250")
    expect(source).toContain("export async function replacePokedexEntries")
    expect(source).toContain("await tx.pokedexEntry.deleteMany({ where: { ownerId } })")
    expect(source).toContain("for (const chunk of chunkDexNumbers(dexNumbers))")
    expect(source).toContain("await tx.pokedexEntry.createMany")
    expect(source).not.toContain("dexNumber: { notIn: releasedDexNumbers }")
  })
})
