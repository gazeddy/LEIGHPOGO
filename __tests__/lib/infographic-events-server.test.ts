import type { EventDetailsEnrichment } from "../../lib/event-details-server";
import type { PokemonGoEventSummary } from "../../lib/events";
import { mergeInfographicEventDetails } from "../../lib/infographic-events-server";

function eventFixture(): PokemonGoEventSummary {
  return {
    eventID: "mega-ascension",
    name: "Mega Ascension",
    eventType: "event",
    heading: "Event",
    link: "https://leekduck.com/events/mega-ascension/",
    image: null,
    start: "2026-08-31T10:00:00.000",
    end: "2026-09-04T23:59:00.000",
    tags: [],
    description: null,
    campfireUrl: null,
    wildSpawns: [],
    featuredRaids: [],
    bonuses: [],
    raidSchedule: [
      {
        date: "Wednesday, September 2",
        time: null,
        label: null,
        bosses: [
          {
            name: "Mega Skarmory",
            image: "https://cdn.leekduck.com/skarmory.png",
            canBeShiny: true,
            raidType: "Mega",
          },
        ],
      },
    ],
    source: "feed",
  };
}

function detailsFixture(): EventDetailsEnrichment {
  return {
    description: "Detailed event description.",
    bonuses: ["Remote Raid Pass limit increased to 30"],
    wildSpawns: [
      {
        name: "Bellsprout",
        image: "https://cdn.leekduck.com/bellsprout.png",
        canBeShiny: true,
      },
    ],
    featuredRaids: [
      {
        name: "Mega Dragonite",
        image: "https://cdn.leekduck.com/dragonite.png",
        canBeShiny: true,
      },
    ],
  };
}

describe("infographic event enrichment", () => {
  test("adds fresh bonuses, spawns and raids while preserving the primary raid schedule", () => {
    const details = new Map<string, EventDetailsEnrichment>([
      ["https://leekduck.com/events/mega-ascension", detailsFixture()],
    ]);

    const result = mergeInfographicEventDetails(eventFixture(), details);

    expect(result.description).toBe("Detailed event description.");
    expect(result.bonuses).toEqual(["Remote Raid Pass limit increased to 30"]);
    expect(result.wildSpawns?.map((pokemon) => pokemon.name)).toEqual([
      "Bellsprout",
    ]);
    expect(result.featuredRaids?.map((pokemon) => pokemon.name)).toEqual([
      "Mega Dragonite",
    ]);
    expect(result.raidSchedule?.[0]?.bosses[0]?.name).toBe("Mega Skarmory");
    expect(result.link).toBe("https://leekduck.com/events/mega-ascension/");
  });

  test("keeps cached event content when the detail feed has no match", () => {
    const event = eventFixture();
    event.bonuses = ["Cached bonus"];
    event.wildSpawns = [
      { name: "Pikachu", image: null, canBeShiny: true },
    ];

    const result = mergeInfographicEventDetails(event, new Map());

    expect(result.bonuses).toEqual(["Cached bonus"]);
    expect(result.wildSpawns?.[0]?.name).toBe("Pikachu");
  });
});
