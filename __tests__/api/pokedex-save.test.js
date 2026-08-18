const { createMocks } = require("node-mocks-http")
const { getServerSession } = require("next-auth/next")

jest.mock("next-auth/next", () => ({
  getServerSession: jest.fn(),
}))

jest.mock("../../pages/api/auth/[...nextauth]", () => ({
  authOptions: {},
}))

const mockPreviousCaughtFindMany = jest.fn()
const mockPokedexDeleteMany = jest.fn()
const mockCreateMany = jest.fn()
const mockWantedDeleteMany = jest.fn()

jest.mock("../../lib/prisma", () => ({
  __esModule: true,
  default: {
    pokedexEntry: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(async (callback) =>
      callback({
        pokedexEntry: {
          findMany: mockPreviousCaughtFindMany,
          deleteMany: mockPokedexDeleteMany,
          createMany: mockCreateMany,
        },
        wantedTrade: {
          deleteMany: mockWantedDeleteMany,
        },
      })
    ),
  },
}))

jest.mock("../../lib/releasedPokemonCache", () => ({
  filterReleasedDexNumbers: (values, releasedValues) => {
    const released = new Set(releasedValues.map(Number))
    return Array.from(new Set(values.map(Number)))
      .filter((value) => Number.isInteger(value) && released.has(value))
      .sort((left, right) => left - right)
  },
  getReleasedPokemonData: jest.fn(async () => ({
    dexNumbers: Array.from({ length: 1100 }, (_, index) => index + 1),
  })),
}))

jest.mock("../../lib/pokemonAvailability", () => ({
  applyPokemonAvailabilityOverrides: (values) => values,
}))

jest.mock("../../lib/pokemonAvailabilityStore", () => ({
  readPokemonAvailabilityOverrides: jest.fn(async () => ({ overrides: [] })),
}))

const handler = require("../../pages/api/pokedex").default

describe("PUT /api/pokedex", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPreviousCaughtFindMany.mockResolvedValue([])
    mockPokedexDeleteMany.mockResolvedValue({ count: 0 })
    mockCreateMany.mockResolvedValue({ count: 0 })
    mockWantedDeleteMany.mockResolvedValue({ count: 0 })
    getServerSession.mockResolvedValue({
      user: { id: 42, ign: "gaz", role: "user" },
    })
  })

  test("replaces a near-complete Pokédex in bounded SQLite-safe chunks", async () => {
    const dexNumbers = Array.from({ length: 1050 }, (_, index) => index + 1)
    const { req, res } = createMocks({
      method: "PUT",
      body: { dexNumbers },
    })

    await handler(req, res)

    expect(res._getStatusCode()).toBe(200)
    expect(mockPokedexDeleteMany).toHaveBeenCalledTimes(1)
    expect(mockPokedexDeleteMany).toHaveBeenCalledWith({ where: { ownerId: 42 } })
    expect(mockCreateMany).toHaveBeenCalledTimes(5)
    expect(mockWantedDeleteMany).toHaveBeenCalledTimes(5)

    const writtenDexNumbers = mockCreateMany.mock.calls.flatMap(
      ([call]) => call.data.map((entry) => entry.dexNumber)
    )
    expect(writtenDexNumbers).toEqual(dexNumbers)
    expect(
      Math.max(...mockCreateMany.mock.calls.map(([call]) => call.data.length))
    ).toBeLessThanOrEqual(250)
    expect(
      Math.max(
        ...mockWantedDeleteMany.mock.calls.map(
          ([call]) => call.where.dexNumber.in.length
        )
      )
    ).toBeLessThanOrEqual(250)
  })

  test("removes only plain wanted listings for Pokémon newly marked caught", async () => {
    mockPreviousCaughtFindMany.mockResolvedValue([
      { dexNumber: 1 },
      { dexNumber: 2 },
    ])
    mockWantedDeleteMany.mockResolvedValue({ count: 1 })

    const { req, res } = createMocks({
      method: "PUT",
      body: { dexNumbers: [1, 2, 3, 4] },
    })

    await handler(req, res)

    expect(res._getStatusCode()).toBe(200)
    expect(mockWantedDeleteMany).toHaveBeenCalledTimes(1)
    expect(mockWantedDeleteMany).toHaveBeenCalledWith({
      where: {
        ownerId: 42,
        dexNumber: { in: [3, 4] },
        shiny: false,
        lucky: false,
        xxl: false,
        xxs: false,
        costume: false,
        background: false,
        dynamax: false,
        gigantamax: false,
      },
    })
    expect(JSON.parse(res._getData())).toMatchObject({
      dexNumbers: [1, 2, 3, 4],
      newlyCaughtDexNumbers: [3, 4],
      removedWantedCount: 1,
    })
  })
})
