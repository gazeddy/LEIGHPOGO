import {
  canonicalCampfireMeetupUrl,
  canonicaliseEventOverrideCampfireLinks,
  findCampfireDuplicateAssignments,
  formatCampfireDuplicateWarning,
  resolveCampfireMeetupUrl,
} from "../../lib/campfire-links";
import type { EventOverride } from "../../lib/event-overrides";

function redirect(location: string): Response {
  return {
    status: 302,
    headers: {
      get(name: string) {
        return name.toLowerCase() === "location" ? location : null;
      },
    },
  } as Response;
}

function override(
  eventID: string,
  name: string,
  meetups: EventOverride["campfireMeetups"],
): EventOverride {
  return {
    eventID,
    name,
    heading: "Event",
    description: null,
    campfireUrl: null,
    campfireMeetups: meetups,
    image: null,
    tags: [],
    hidden: false,
    hideAt: null,
    updatedAt: "2026-08-31T12:00:00.000Z",
  };
}

describe("Campfire link canonicalisation", () => {
  test("keeps an already canonical Campfire meetup URL without fetching", async () => {
    const fetchImpl = jest.fn() as unknown as typeof fetch;
    const input =
      "https://campfire.nianticlabs.com/discover/meetup/5a2068fd-1877-4b0a-b069-d122abd15d12?source=share";

    await expect(resolveCampfireMeetupUrl(input, fetchImpl)).resolves.toBe(
      "https://campfire.nianticlabs.com/discover/meetup/5a2068fd-1877-4b0a-b069-d122abd15d12",
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("resolves a cmpf.re short link to its canonical meetup URL", async () => {
    const fetchImpl = jest.fn(async () =>
      redirect(
        "https://campfire.nianticlabs.com/discover/meetup/f73e0fdf-8018-412d-8278-89357a4d8e0a",
      ),
    ) as unknown as typeof fetch;

    await expect(
      resolveCampfireMeetupUrl("https://cmpf.re/bHvfSd", fetchImpl),
    ).resolves.toBe(
      "https://campfire.nianticlabs.com/discover/meetup/f73e0fdf-8018-412d-8278-89357a4d8e0a",
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("rejects a short-link redirect to an unrelated host", async () => {
    const fetchImpl = jest.fn(async () =>
      redirect("https://example.com/not-campfire"),
    ) as unknown as typeof fetch;

    await expect(
      resolveCampfireMeetupUrl("https://cmpf.re/unsafe", fetchImpl),
    ).rejects.toThrow("must use cmpf.re or campfire.nianticlabs.com");
  });

  test("canonicalises every scheduled meetup before the override is stored", async () => {
    const destinations = new Map([
      [
        "https://cmpf.re/day1",
        "https://campfire.nianticlabs.com/discover/meetup/5a2068fd-1877-4b0a-b069-d122abd15d12",
      ],
      [
        "https://cmpf.re/day2",
        "https://campfire.nianticlabs.com/discover/meetup/9c277610-248d-47cb-87ff-d3fa395abf05",
      ],
    ]);
    const fetchImpl = jest.fn(async (input: RequestInfo | URL) => {
      const destination = destinations.get(String(input));
      if (!destination) throw new Error("unexpected URL");
      return redirect(destination);
    }) as unknown as typeof fetch;

    const result = await canonicaliseEventOverrideCampfireLinks(
      {
        eventID: "multi-day",
        name: "Multi-day event",
        heading: "Event",
        campfireMeetups: [
          {
            label: "Day 1",
            url: "https://cmpf.re/day1",
            activeFrom: "2026-09-05T09:00:00.000Z",
          },
          {
            label: "Day 2",
            url: "https://cmpf.re/day2",
            activeFrom: "2026-09-06T09:00:00.000Z",
          },
        ],
      },
      fetchImpl,
    );

    expect(result.campfireMeetups?.map((meetup) => meetup.url)).toEqual([
      "https://campfire.nianticlabs.com/discover/meetup/5a2068fd-1877-4b0a-b069-d122abd15d12",
      "https://campfire.nianticlabs.com/discover/meetup/9c277610-248d-47cb-87ff-d3fa395abf05",
    ]);
  });

  test("flags when the same canonical meetup is assigned to different events", () => {
    const shared =
      "https://campfire.nianticlabs.com/discover/meetup/5a2068fd-1877-4b0a-b069-d122abd15d12";
    const overrides = [
      override("mega-ascension", "Mega Ascension", [
        {
          label: "Day 1",
          url: shared,
          activeFrom: "2026-08-31T09:00:00.000Z",
        },
      ]),
      override("mega-finale", "GO Fest Mega Finale", [
        {
          label: "Day 1",
          url: shared,
          activeFrom: "2026-09-05T09:00:00.000Z",
        },
      ]),
    ];

    const duplicates = findCampfireDuplicateAssignments(
      "mega-finale",
      overrides,
    );

    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].map((item) => item.eventID)).toEqual([
      "mega-ascension",
      "mega-finale",
    ]);
    expect(formatCampfireDuplicateWarning(duplicates)).toContain(
      "Mega Ascension (Day 1) and GO Fest Mega Finale (Day 1)",
    );
  });

  test("recognises only canonical Campfire meetup paths", () => {
    expect(
      canonicalCampfireMeetupUrl(
        "https://campfire.nianticlabs.com/discover/meetup/5a2068fd-1877-4b0a-b069-d122abd15d12",
      ),
    ).not.toBeNull();
    expect(
      canonicalCampfireMeetupUrl("https://campfire.nianticlabs.com/discover"),
    ).toBeNull();
  });
});
