const { getHomeCards } = require("../lib/homeCards")

function cardTitles(options) {
  return getHomeCards(options).map((card) => card.title)
}

function tradeCard(options) {
  return getHomeCards(options).find((card) => card.title === "Trade Listings")
}

describe("role-aware homepage cards", () => {
  it("shows only friend codes and events to logged-out visitors", () => {
    expect(cardTitles()).toEqual(["Friend Codes", "Events"])
  })

  it("adds member tools and trade listings for logged-in members", () => {
    expect(cardTitles({ isLoggedIn: true })).toEqual([
      "Friend Codes",
      "Events",
      "Guides",
      "Gym Map",
      "Trade Listings",
    ])
  })

  it("sends members without a friend code to the friend-code page", () => {
    expect(tradeCard({ isLoggedIn: true })).toMatchObject({
      href: "/friend-codes",
      title: "Trade Listings",
    })
  })

  it("sends eligible members to the private trade listings", () => {
    expect(tradeCard({ isLoggedIn: true, hasFriendCode: true })).toMatchObject({
      href: "/trades",
      title: "Trade Listings",
    })
  })

  it("adds the admin panel for administrators", () => {
    expect(cardTitles({ isLoggedIn: true, isAdmin: true })).toEqual([
      "Friend Codes",
      "Events",
      "Guides",
      "Gym Map",
      "Trade Listings",
      "Admin Panel",
    ])
  })

  it("treats an administrator as a logged-in member", () => {
    expect(cardTitles({ isAdmin: true })).toContain("Trade Listings")
  })
})
