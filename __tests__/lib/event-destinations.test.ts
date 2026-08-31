import { getEventDestination } from "../../lib/events";

describe("event destinations", () => {
  it("keeps imported events inside the LeighPogo Events page", () => {
    expect(
      getEventDestination({
        eventID: "pokemon-go-fest-2026-mega-finale",
      }),
    ).toBe("/events?event=pokemon-go-fest-2026-mega-finale");
  });

  it("encodes event IDs when building the native destination", () => {
    expect(getEventDestination({ eventID: "local event / Leigh" })).toBe(
      "/events?event=local%20event%20%2F%20Leigh",
    );
  });
});
