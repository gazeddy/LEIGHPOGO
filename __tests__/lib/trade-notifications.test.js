process.env.DATABASE_URL =
  process.env.DATABASE_URL || "file:trade-notification-tests?mode=memory&cache=shared"

jest.mock("../../lib/prisma", () => ({
  wantedTrade: {
    findMany: jest.fn(),
  },
  tradeNotification: {
    upsert: jest.fn(),
  },
}))

const prisma = require("../../lib/prisma")
const {
  syncWantedTradeNotificationsForListing,
  tradeModifierLabels,
  wantedTradeMatchesOffer,
} = require("../../lib/tradeNotifications")

describe("wishlist trade matching", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    prisma.tradeNotification.upsert.mockImplementation(({ create }) =>
      Promise.resolve(create),
    )
  })

  it("matches names case-insensitively and allows unspecified modifiers", () => {
    expect(wantedTradeMatchesOffer(
      { pokemonName: "Pikachu" },
      { pokemonName: "pikachu", shiny: true, lucky: true },
    )).toBe(true)
  })

  it("requires every selected wishlist modifier on the offered Pokémon", () => {
    const wanted = {
      pokemonName: "Mewtwo",
      shiny: true,
      lucky: true,
      xxl: true,
    }

    expect(wantedTradeMatchesOffer(wanted, {
      pokemonName: "Mewtwo",
      shiny: true,
      lucky: true,
      xxl: true,
    })).toBe(true)

    expect(wantedTradeMatchesOffer(wanted, {
      pokemonName: "Mewtwo",
      shiny: true,
      lucky: false,
      xxl: true,
    })).toBe(false)
  })

  it("does not match a different Pokémon", () => {
    expect(wantedTradeMatchesOffer(
      { pokemonName: "Eevee" },
      { pokemonName: "Pikachu" },
    )).toBe(false)
  })

  it("formats the offered modifiers for the notification", () => {
    expect(tradeModifierLabels({
      shiny: true,
      lucky: true,
      xxl: true,
      background: true,
    })).toEqual(["Shiny", "Lucky", "XXL", "Special background"])
  })

  it("notifies each wishlist owner and the listing owner", async () => {
    prisma.wantedTrade.findMany.mockResolvedValueOnce([
      {
        ownerId: 2,
        owner: { ign: "Misty" },
        pokemonName: "Pikachu",
        shiny: true,
      },
      {
        ownerId: 3,
        owner: { ign: "Brock" },
        pokemonName: "Pikachu",
      },
    ])

    await syncWantedTradeNotificationsForListing({
      id: 17,
      ownerId: 1,
      items: [
        {
          direction: "OFFER",
          pokemonName: "Pikachu",
          shiny: true,
          lucky: true,
        },
      ],
    })

    expect(prisma.wantedTrade.findMany).toHaveBeenCalledWith({
      where: { ownerId: { not: 1 } },
      include: { owner: { select: { ign: true } } },
    })
    expect(prisma.tradeNotification.upsert).toHaveBeenCalledTimes(3)

    const notifications = prisma.tradeNotification.upsert.mock.calls.map(
      ([call]) => call.create,
    )

    expect(notifications).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ownerId: 2,
        listingId: 17,
        type: "WISHLIST_MATCH",
        pokemonName: "Pikachu",
      }),
      expect.objectContaining({
        ownerId: 3,
        listingId: 17,
        type: "WISHLIST_MATCH",
        pokemonName: "Pikachu",
      }),
      expect.objectContaining({
        ownerId: 1,
        listingId: 17,
        type: "LISTING_MATCH",
        pokemonName: "Pikachu",
        matchedTrainerSummary: "Misty and Brock",
        matchedTrainerCount: 2,
      }),
    ]))
  })

  it("does not notify the listing owner when nobody else matches", async () => {
    prisma.wantedTrade.findMany.mockResolvedValueOnce([])

    const notifications = await syncWantedTradeNotificationsForListing({
      id: 18,
      ownerId: 1,
      items: [{ direction: "OFFER", pokemonName: "Eevee" }],
    })

    expect(notifications).toEqual([])
    expect(prisma.tradeNotification.upsert).not.toHaveBeenCalled()
  })
})
