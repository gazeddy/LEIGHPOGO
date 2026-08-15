const { createMocks } = require("node-mocks-http")
const { getServerSession } = require("next-auth/next")

jest.mock("next-auth/next", () => ({
  getServerSession: jest.fn(),
}))

jest.mock("../../pages/api/auth/[...nextauth]", () => ({
  authOptions: {},
}))

const deleteMany = jest.fn()
const createMany = jest.fn()

jest.mock("../../lib/prisma", () => ({
  __esModule: true,
  default: {
    pokedexEntry: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(async (callback) =>
      callback({
        pokedexEntry: {
          deleteMany,
          createMany,
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
    deleteMany.mockResolvedValue({ count: 0 })
    createMany.mockResolvedValue({ count: 0 })
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
    expect(deleteMany).toHaveBeenCalledTimes(1)
    expect(deleteMany).toHaveBeenCalledWith({ where: { ownerId: 42 } })
    expect(createMany).toHaveBeenCalledTimes(5)

    const writtenDexNumbers = createMany.mock.calls.flatMap(
      ([call]) => call.data.map((entry) => entry.dexNumber)
    )
    expect(writtenDexNumbers).toEqual(dexNumbers)
    expect(
      Math.max(...createMany.mock.calls.map(([call]) => call.data.length))
    ).toBeLessThanOrEqual(250)
  })
})
