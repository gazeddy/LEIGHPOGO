import {
  findEventDetails,
  parseEventDetailsPayload,
} from "../../lib/event-details-server";

describe("event details enrichment", () => {
  it("extracts native card details from the richer event dataset", () => {
    const details = parseEventDetailsPayload({
      Event: [
        {
          title: "Test Event",
          article_url: "https://leekduck.com/events/test-event/",
          description: "A useful event description.",
          details: {
            bonuses: ["2× Catch Stardust", "Half hatch distance"],
            spawns: [
              {
                name: "Pikachu",
                asset_url: "https://example.com/pikachu.png",
                shiny_available: true,
              },
            ],
            raids: [
              {
                name: "Mega Gengar",
                asset_url: "https://example.com/gengar.png",
                shiny_available: true,
              },
            ],
          },
        },
      ],
    });

    expect(
      findEventDetails(details, "https://leekduck.com/events/test-event"),
    ).toEqual({
      description: "A useful event description.",
      wildSpawns: [
        {
          name: "Pikachu",
          image: "https://example.com/pikachu.png",
          canBeShiny: true,
        },
      ],
      featuredRaids: [
        {
          name: "Mega Gengar",
          image: "https://example.com/gengar.png",
          canBeShiny: true,
        },
      ],
      bonuses: ["2× Catch Stardust", "Half hatch distance"],
    });
  });

  it("returns an empty map for malformed payloads", () => {
    expect(parseEventDetailsPayload([]).size).toBe(0);
    expect(parseEventDetailsPayload(null).size).toBe(0);
  });
});
