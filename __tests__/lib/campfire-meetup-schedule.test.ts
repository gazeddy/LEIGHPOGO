import { activeCampfireMeetup } from "../../lib/event-overrides";

describe("Campfire meetup schedule", () => {
  const schedule = {
    campfireUrl: null,
    campfireMeetups: [
      {
        label: "Day 1",
        url: "https://campfire.nianticlabs.com/day-1",
        activeFrom: "2026-11-14T10:00:00.000Z",
      },
      {
        label: "Day 2",
        url: "https://campfire.nianticlabs.com/day-2",
        activeFrom: "2026-11-14T18:00:00.000Z",
      },
      {
        label: "Day 3",
        url: "https://campfire.nianticlabs.com/day-3",
        activeFrom: "2026-11-15T18:00:00.000Z",
      },
    ],
  };

  it("shows the first meetup before the event starts", () => {
    expect(
      activeCampfireMeetup(schedule, new Date("2026-11-14T08:00:00.000Z"))?.url,
    ).toBe("https://campfire.nianticlabs.com/day-1");
  });

  it("switches to the next meetup exactly at its configured takeover time", () => {
    expect(
      activeCampfireMeetup(schedule, new Date("2026-11-14T17:59:59.000Z"))?.url,
    ).toBe("https://campfire.nianticlabs.com/day-1");

    expect(
      activeCampfireMeetup(schedule, new Date("2026-11-14T18:00:00.000Z"))?.url,
    ).toBe("https://campfire.nianticlabs.com/day-2");

    expect(
      activeCampfireMeetup(schedule, new Date("2026-11-15T18:00:00.000Z"))?.url,
    ).toBe("https://campfire.nianticlabs.com/day-3");
  });

  it("keeps legacy single Campfire links working", () => {
    expect(
      activeCampfireMeetup(
        {
          campfireUrl: "https://campfire.nianticlabs.com/legacy",
          campfireMeetups: [],
        },
        new Date("2026-11-14T12:00:00.000Z"),
      )?.url,
    ).toBe("https://campfire.nianticlabs.com/legacy");
  });
});
