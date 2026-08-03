const {
  normaliseRegionalOverride,
  normaliseRegions,
} = require("../../lib/pokemonRegionalStore")

describe("Pokémon regional metadata", () => {
  test("normalises and de-duplicates selected regions", () => {
    expect(
      normaliseRegions([" Europe ", "europe", "Asia", "", null])
    ).toEqual(["Europe", "Asia"])
  })

  test("parses database JSON and clears locations for non-regional Pokémon", () => {
    expect(
      normaliseRegionalOverride({
        dexNumber: "122",
        isRegional: true,
        regions: '["Europe","United Kingdom"]',
        note: "Mime lock",
      })
    ).toMatchObject({
      dexNumber: 122,
      isRegional: true,
      regions: ["Europe", "United Kingdom"],
      note: "Mime lock",
    })

    expect(
      normaliseRegionalOverride({
        dexNumber: 25,
        isRegional: false,
        regions: '["Asia"]',
      }).regions
    ).toEqual([])
  })
})
