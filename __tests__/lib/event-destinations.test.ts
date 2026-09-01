import { getEventDestination } from "../../lib/events";

describe("event destinations", () => {
  it("gives imported events a crawlable LeighPogo event page", () => {
    expect(
      getEventDestination({
        eventID: "pokemon-go-fest-2026-mega-finale",
      }),
    ).toBe("/events/pokemon-go-fest-2026-mega-finale");
  });

  it("encodes event IDs when building the native destination", () => {
    expect(getEventDestination({ eventID: "local event / Leigh" })).toBe(
      "/events/local%20event%20%2F%20Leigh",
    );
  });
});
