const {
  buildRaidEventPushPayload,
  inferRaidCategory,
  isRaidEventReminderDue,
  raidEventBossItems,
  raidEventBossText,
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
