const fs = require("fs")
const path = require("path")
const {
  isDittoCacheForSeason,
  normaliseDittoDisguises,
} = require("../../lib/ditto-disguises")
const {
  selectCurrentPokemonGoSeason,
} = require("../../lib/season-server")

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

  it("keeps the cache while the ScrapedDuck season ID is unchanged", () => {
    expect(
      isDittoCacheForSeason(
        "season-23-forever-forward",
        "season-23-forever-forward",
      ),
    ).toBe(true)
    expect(
      isDittoCacheForSeason(
        "season-23-forever-forward",
        "season-24-next-season",
      ),
    ).toBe(false)
  })

  it("selects the active ScrapedDuck season using London-local timestamps", () => {
    const events = [
      {
        eventID: "season-old",
        name: "Old Season",
        eventType: "season",
        heading: "Season",
        link: null,
        image: null,
        start: "2026-03-01T10:00:00.000",
        end: "2026-06-02T10:00:00.000",
      },
      {
        eventID: "season-23-forever-forward",
        name: "Forever Forward",
        eventType: "season",
        heading: "Season",
        link: null,
        image: null,
        start: "2026-06-02T10:00:00.000",
        end: "2026-09-08T10:00:00.000",
      },
    ]

    expect(
      selectCurrentPokemonGoSeason(
        events,
        new Date("2026-07-31T15:00:00.000Z"),
      ),
    ).toEqual({
      eventID: "season-23-forever-forward",
      name: "Forever Forward",
      start: "2026-06-02T10:00:00.000",
      end: "2026-09-08T10:00:00.000",
    })
  })

  it("stops using a season at its exact ScrapedDuck end time", () => {
    const events = [
      {
        eventID: "season-23-forever-forward",
        name: "Forever Forward",
        eventType: "season",
        heading: "Season",
        link: null,
        image: null,
        start: "2026-06-02T10:00:00.000",
        end: "2026-09-08T10:00:00.000",
      },
    ]

    expect(
      selectCurrentPokemonGoSeason(
        events,
        new Date("2026-09-08T09:00:00.000Z"),
      ),
    ).toBeNull()
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
