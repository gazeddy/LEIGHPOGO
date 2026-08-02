import { getEventDestination } from "../../lib/events";

describe("event destinations", () => {
  it("prefers a Campfire override over the imported event link", () => {
    expect(
      getEventDestination({
        campfireUrl: "https://campfire.nianticlabs.com/meetup/leigh",
        link: "https://leekduck.com/events/community-day/",
      }),
    ).toBe("https://campfire.nianticlabs.com/meetup/leigh");
  });

  it("falls back to the imported link when no Campfire URL exists", () => {
    expect(
      getEventDestination({
        campfireUrl: null,
        link: "https://leekduck.com/events/community-day/",
      }),
    ).toBe("https://leekduck.com/events/community-day/");
  });

  it("returns null when neither destination exists", () => {
    expect(getEventDestination({ campfireUrl: null, link: null })).toBeNull();
  });
});
