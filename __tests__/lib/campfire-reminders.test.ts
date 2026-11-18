import {
  DEFAULT_CAMPFIRE_REMINDER_SETTINGS,
  eventMatchesCampfireReminderSettings,
  eventsMissingCampfireMeetups,
  type CampfireReminderSettings,
} from "../../lib/campfire-reminder-rules";
import type { EventOverride } from "../../lib/event-overrides";
import type { PokemonGoEventSummary } from "../../lib/events";

function event(overrides: Partial<PokemonGoEventSummary> = {}): PokemonGoEventSummary {
  return {
    eventID: "event-1",
    name: "Generic Event",
    eventType: "event",
    heading: "Event",
    link: null,
    image: null,
    start: "2026-09-03T10:00:00.000Z",
    end: "2026-09-03T18:00:00.000Z",
    description: null,
    tags: [],
    campfireUrl: null,
    bonuses: [],
    wildSpawns: [],
    featuredRaids: [],
    raidSchedule: [],
    ...overrides,
  };
}

function override(eventID: string, values: Partial<EventOverride> = {}): EventOverride {
  return {
    eventID,
    name: "Override",
    heading: "Event",
    description: null,
    campfireUrl: null,
    campfireMeetups: [],
    image: null,
    tags: [],
    hidden: false,
    hideAt: null,
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...values,
  };
}

describe("Campfire meetup reminder rules", () => {
  it("uses Raid Hour, Raid Day, GO Fest and weekend events as recommended defaults", () => {
    expect(
      eventMatchesCampfireReminderSettings(
        event({ eventType: "raid-hour", name: "Raid Hour" }),
        DEFAULT_CAMPFIRE_REMINDER_SETTINGS,
      ),
    ).toBe(true);

    expect(
      eventMatchesCampfireReminderSettings(
        event({ eventType: "raid-day", name: "Mega Raid Day" }),
        DEFAULT_CAMPFIRE_REMINDER_SETTINGS,
      ),
    ).toBe(true);

    expect(
      eventMatchesCampfireReminderSettings(
        event({ name: "Pokémon GO Fest 2026: Mega Finale" }),
        DEFAULT_CAMPFIRE_REMINDER_SETTINGS,
      ),
    ).toBe(true);

    expect(
      eventMatchesCampfireReminderSettings(
        event({
          name: "Saturday Special",
          start: "2026-09-05T10:00:00.000Z",
          end: "2026-09-05T18:00:00.000Z",
        }),
        DEFAULT_CAMPFIRE_REMINDER_SETTINGS,
      ),
    ).toBe(true);
  });

  it("allows admins to replace the defaults with arbitrary event types and keywords", () => {
    const settings: CampfireReminderSettings = {
      eventTypes: ["community-day"],
      excludedEventTypes: [],
      nameKeywords: ["research spectacular"],
      includeWeekendEvents: false,
      updatedAt: null,
    };

    expect(
      eventMatchesCampfireReminderSettings(
        event({ eventType: "community-day", name: "Community Day" }),
        settings,
      ),
    ).toBe(true);
    expect(
      eventMatchesCampfireReminderSettings(
        event({ name: "Research Spectacular: Pikachu" }),
        settings,
      ),
    ).toBe(true);
    expect(
      eventMatchesCampfireReminderSettings(
        event({ eventType: "raid-hour", name: "Raid Hour" }),
        settings,
      ),
    ).toBe(false);
  });

  it("treats an explicitly OFF event type as authoritative over keywords and weekends", () => {
    const settings: CampfireReminderSettings = {
      eventTypes: [],
      excludedEventTypes: ["raid-day"],
      nameKeywords: ["raid day"],
      includeWeekendEvents: true,
      updatedAt: null,
    };

    expect(
      eventMatchesCampfireReminderSettings(
        event({
          eventType: "raid-day",
          name: "Mega Raid Day",
          start: "2026-09-05T10:00:00.000Z",
          end: "2026-09-05T18:00:00.000Z",
        }),
        settings,
      ),
    ).toBe(false);
  });

  it("leaves AUTO event types available to keyword and weekend rules", () => {
    const settings: CampfireReminderSettings = {
      eventTypes: [],
      excludedEventTypes: [],
      nameKeywords: ["go fest"],
      includeWeekendEvents: true,
      updatedAt: null,
    };

    expect(
      eventMatchesCampfireReminderSettings(
        event({ eventType: "event", name: "Pokémon GO Fest 2026" }),
        settings,
      ),
    ).toBe(true);
    expect(
      eventMatchesCampfireReminderSettings(
        event({
          eventType: "event",
          name: "Saturday Special",
          start: "2026-09-05T10:00:00.000Z",
          end: "2026-09-05T18:00:00.000Z",
        }),
        settings,
      ),
    ).toBe(true);
  });

  it("clears the reminder when a feed, legacy override or scheduled meetup exists", () => {
    const raidHour = event({
      eventID: "raid-hour-1",
      eventType: "raid-hour",
      name: "Raid Hour",
    });
    const now = new Date("2026-09-02T12:00:00.000Z");

    expect(
      eventsMissingCampfireMeetups(
        [{ ...raidHour, campfireUrl: "https://cmpf.re/feed" }],
        [],
        DEFAULT_CAMPFIRE_REMINDER_SETTINGS,
        now,
      ),
    ).toHaveLength(0);

    expect(
      eventsMissingCampfireMeetups(
        [raidHour],
        [override(raidHour.eventID, { campfireUrl: "https://cmpf.re/legacy" })],
        DEFAULT_CAMPFIRE_REMINDER_SETTINGS,
        now,
      ),
    ).toHaveLength(0);

    expect(
      eventsMissingCampfireMeetups(
        [raidHour],
        [
          override(raidHour.eventID, {
            campfireMeetups: [
              {
                label: "Day 1",
                url: "https://cmpf.re/day1",
                activeFrom: "2026-09-03T10:00:00.000Z",
              },
            ],
          }),
        ],
        DEFAULT_CAMPFIRE_REMINDER_SETTINGS,
        now,
      ),
    ).toHaveLength(0);
  });

  it("does not remind for events that have already ended", () => {
    const missing = eventsMissingCampfireMeetups(
      [
        event({
          eventType: "raid-hour",
          name: "Old Raid Hour",
          start: "2026-08-26T18:00:00.000Z",
          end: "2026-08-26T19:00:00.000Z",
        }),
      ],
      [],
      DEFAULT_CAMPFIRE_REMINDER_SETTINGS,
      new Date("2026-09-02T12:00:00.000Z"),
    );

    expect(missing).toHaveLength(0);
  });
});
