const { getHomeCards } = require("../lib/homeCards");

function cardTitles(options) {
  return getHomeCards(options).map((card) => card.title);
}

describe("role-aware homepage cards", () => {
  it("shows only friend codes and events to logged-out visitors", () => {
    expect(cardTitles()).toEqual(["Friend Codes", "Events"]);
  });

  it("adds guides and the gym map for logged-in members", () => {
    expect(cardTitles({ isLoggedIn: true })).toEqual([
      "Friend Codes",
      "Events",
      "Guides",
      "Gym Map",
    ]);
  });

  it("adds the admin panel for administrators", () => {
    expect(cardTitles({ isLoggedIn: true, isAdmin: true })).toEqual([
      "Friend Codes",
      "Events",
      "Guides",
      "Gym Map",
      "Admin Panel",
    ]);
  });

  it("treats an administrator as a logged-in member", () => {
    expect(cardTitles({ isAdmin: true })).toContain("Gym Map");
  });
});
