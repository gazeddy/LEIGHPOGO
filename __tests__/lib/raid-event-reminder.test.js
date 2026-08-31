const {
  buildRaidEventPushPayload,
  inferRaidCategory,
  isRaidEventReminderDue,
  isSupportedRaidEvent,
  raidEventBossItems,
  raidEventBossText,
  selectCurrentFiveStarRaidItems,
} = require("../../lib/raid-event-reminder")

function event(overrides = {}) {
  return {
    eventID: "lunala-raid-hour-2026-08-26",
    name: "Lunala Raid Hour",
    eventType: "raid-hour",
    heading: "Raid Hour",
    link: "https://example.test/lunala",
    image: null,
    start: "2026-08-26T18:00:00",
    end: "2026-08-26T19:00:00",
    ...overrides,
  }
}

function weekendEvent(overrides = {}) {
  return event({
    eventID: "pokemon-go-fest-2026-mega-finale",
    name: "Pokémon GO Fest 2026: Mega Finale",
    eventType: "event",
    heading: "Event",
    tags: ["event"],
    start: "2026-09-05T10:00:00",
    end: "2026-09-06T18:00:00",
    raidSchedule: [
      {
        date: "Saturday",
        time: "10:00 a.m. to 11:00 a.m.",
        label: "Verdant Overgrowth",
        bosses: [
          { name: "Mega Beedrill", image: null, canBeShiny: true, raidType: "Mega" },
          { name: "Mega Victreebel", image: null, canBeShiny: true, raidType: "Mega" },
        ],
      },
    ],
    ...overrides,
  })
}

describe("raid event push reminder", () => {
  it("becomes due during the 30 minutes before a London-local raid event", () => {
    expect(
      isRaidEventReminderDue(
        event(),
        new Date("2026-08-26T16:30:00.000Z"),
      ),
    ).toBe(true)

    expect(
      isRaidEventReminderDue(
        event(),
        new Date("2026-08-26T16:29:59.000Z"),
      ),
    ).toBe(false)

    expect(
      isRaidEventReminderDue(
        event(),
        new Date("2026-08-26T17:00:00.000Z"),
      ),
    ).toBe(false)
  })

  it("supports GO Fest-style weekend raid schedules even when the title does not say Raid", () => {
    const goFest = weekendEvent()
    expect(isSupportedRaidEvent(goFest)).toBe(true)
    expect(
      isRaidEventReminderDue(goFest, new Date("2026-09-05T08:30:00.000Z")),
    ).toBe(true)
    expect(
      isRaidEventReminderDue(goFest, new Date("2026-09-05T08:29:59.000Z")),
    ).toBe(false)

    expect(raidEventBossItems(goFest).map((item) => [item.category, item.boss])).toEqual([
      ["mega", "Beedrill, Victreebel"],
    ])
  })

  it("does not add a pre-start reminder for an ordinary weekday event schedule", () => {
    const weekday = weekendEvent({
      eventID: "mega-ascension",
      name: "Mega Ascension",
      start: "2026-08-31T10:00:00",
      end: "2026-09-04T23:59:00",
      raidSchedule: [
        {
          date: "Monday, August 31",
          time: null,
          label: null,
          bosses: [
            { name: "Mega Malamar", image: null, canBeShiny: true, raidType: "Mega" },
          ],
        },
      ],
    })
    expect(isSupportedRaidEvent(weekday)).toBe(false)
  })

  it("allows Shadow raids when the event itself is explicitly a Shadow raid event", () => {
    const shadow = weekendEvent({
      eventID: "shadow-raid-weekend",
      name: "Shadow Raid Weekend",
      raidSchedule: [
        {
          date: "Saturday",
          time: "2:00 p.m. to 5:00 p.m.",
          label: null,
          bosses: [
            { name: "Shadow Mewtwo", image: null, canBeShiny: true, raidType: "Shadow 5-Star" },
          ],
        },
      ],
    })

    expect(isSupportedRaidEvent(shadow)).toBe(true)
    expect(raidEventBossItems(shadow).map((item) => item.category)).toEqual(["shadow"])
  })

  it("extracts raid bosses whether the event label is a prefix or suffix", () => {
    expect(raidEventBossText(event())).toBe("Lunala")
    expect(
      raidEventBossText(
        event({
          eventID: "rayquaza-day",
          name: "Raid Day: Mega Rayquaza",
          eventType: "raid-day",
          heading: "Raid Day",
        }),
      ),
    ).toBe("Mega Rayquaza")
  })

  it("builds separate boss items and infers Mega, Shadow and five-star categories", () => {
    const items = raidEventBossItems(
      event({
        eventID: "mixed-raid-day",
        name: "Mega Garchomp and Shadow Lugia and Lunala Raid Day",
        eventType: "raid-day",
        heading: "Raid Day",
      }),
    )

    expect(items.map((item) => [item.boss, item.category])).toEqual([
      ["Mega Garchomp", "mega"],
      ["Shadow Lugia", "shadow"],
      ["Lunala", "five-star"],
    ])
    expect(inferRaidCategory("Mega Charizard X")).toBe("mega")
  })

  it("keeps every simultaneous current five-star boss for a generic Raid Hour", () => {
    const items = [
      { eventID: "a", category: "five-star", state: "current", boss: "Boss One" },
      { eventID: "b", category: "five-star", state: "current", boss: "Boss Two" },
      { eventID: "c", category: "five-star", state: "current", boss: "Boss Three" },
      { eventID: "d", category: "mega", state: "current", boss: "Mega Boss" },
      { eventID: "e", category: "five-star", state: "next", boss: "Next Boss" },
    ]

    expect(selectCurrentFiveStarRaidItems(items).map((item) => item.boss)).toEqual([
      "Boss One",
      "Boss Two",
      "Boss Three",
    ])
  })

  it("builds a single-boss reminder with hundo CP and event deep link", () => {
    expect(
      buildRaidEventPushPayload(event(), [
        {
          name: "Lunala",
          maxUnboostedCp: 2310,
          maxBoostedCp: 2887,
        },
      ]),
    ).toEqual({
      title: "Raid Hour: Lunala",
      body: "Starts in 30 minutes • Hundo: 2310 CP • Weather boosted: 2887 CP",
      tag: "raid-event-lunala-raid-hour-2026-08-26",
      renotify: false,
      url: "/events?event=lunala-raid-hour-2026-08-26",
    })
  })

  it("lists every multi-boss hundo CP pair on its own line", () => {
    const payload = buildRaidEventPushPayload(
      event({
        eventID: "triple-raid-hour",
        name: "Raid Hour",
      }),
      [
        { name: "Boss One", maxUnboostedCp: 2100, maxBoostedCp: 2625 },
        { name: "Boss Two", maxUnboostedCp: 2200, maxBoostedCp: 2750 },
        { name: "Boss Three", maxUnboostedCp: 2300, maxBoostedCp: 2875 },
      ],
    )

    expect(payload.title).toBe("Raid Hour starts in 30 minutes")
    expect(payload.body).toBe(
      "Boss One: Hundo 2100 CP • WB 2625 CP\n" +
        "Boss Two: Hundo 2200 CP • WB 2750 CP\n" +
        "Boss Three: Hundo 2300 CP • WB 2875 CP",
    )
  })

  it("preserves the existing Raid Hour easter-egg hundo wording", () => {
    const payload = buildRaidEventPushPayload(
      event(),
      [{ name: "Lunala", maxUnboostedCp: 2310, maxBoostedCp: 2887 }],
      true,
    )

    expect(payload.body).toBe("Starts in 30 minutes • Hundo - 15/15/15")
    expect(payload.body).not.toContain("2310")
    expect(payload.body).not.toContain("2887")
  })
})
