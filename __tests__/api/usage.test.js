const { createMocks } = require("node-mocks-http")
const { getServerSession } = require("next-auth/next")

jest.mock("next-auth/next", () => ({
  getServerSession: jest.fn(),
}))

jest.mock("../../pages/api/auth/[...nextauth]", () => ({
  authOptions: {},
}))

jest.mock("../../lib/usageEvents", () => ({
  recordUsageEvent: jest.fn(),
}))

const { recordUsageEvent } = require("../../lib/usageEvents")
const handler = require("../../pages/api/usage").default

beforeEach(() => {
  jest.clearAllMocks()
})

describe("usage API", () => {
  it("requires a logged-in member", async () => {
    getServerSession.mockResolvedValueOnce(null)
    const { req, res } = createMocks({
      method: "POST",
      body: { type: "POKEMON_GO_LAUNCHED", path: "/notifications" },
    })

    await handler(req, res)

    expect(res._getStatusCode()).toBe(401)
    expect(recordUsageEvent).not.toHaveBeenCalled()
  })

  it("rejects client attempts to forge server-side event types", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: 12 } })
    const { req, res } = createMocks({
      method: "POST",
      body: { type: "TRADE_CREATED", path: "/trades/new" },
    })

    await handler(req, res)

    expect(res._getStatusCode()).toBe(400)
    expect(recordUsageEvent).not.toHaveBeenCalled()
  })

  it("records the Pokémon GO launch without storing the full user agent in the request payload", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: 12 } })
    const { req, res } = createMocks({
      method: "POST",
      headers: { "user-agent": "Example mobile user agent" },
      body: { type: "POKEMON_GO_LAUNCHED", path: "/notifications" },
    })

    await handler(req, res)

    expect(res._getStatusCode()).toBe(204)
    expect(recordUsageEvent).toHaveBeenCalledWith({
      type: "POKEMON_GO_LAUNCHED",
      ownerId: 12,
      path: "/notifications",
      userAgent: "Example mobile user agent",
    })
  })
})
