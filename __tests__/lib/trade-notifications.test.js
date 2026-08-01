process.env.DATABASE_URL =
  process.env.DATABASE_URL || "file:trade-notification-tests?mode=memory&cache=shared"

const {
  tradeModifierLabels,
  wantedTradeMatchesOffer,
} = require("../../lib/tradeNotifications")

describe("wishlist trade matching", () => {
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
})
