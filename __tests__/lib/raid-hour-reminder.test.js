const {
  buildRaidHourPushPayload,
  getRaidHourLocalState,
  isWednesdayRaidHour,
  normalisePushTimeZone,
} = require("../../lib/raid-hour-reminder")

const lunalaRaid = {
  eventID: "five-star-example",
  category: "five-star",
  label: "5★ Raid Boss",
  boss: "Lunala",
  start: "2026-08-19T10:00:00",
  end: "2026-08-26T10:00:00",
  link: "/tools/raids#raid-five-star-five-star-example",
  state: "current",
  catchCp: [
    {
      boss: "Lunala",
      maxUnboostedCp: 2310,
      maxBoostedCp: 2887,
      possibleShiny: false,
    },
  ],
}

describe("Wednesday Raid Hour push reminder", () => {
  it("fires at 18:00 Wednesday in the device timezone during BST", () => {
    const now = new Date("2026-08-19T17:00:00.000Z")

    expect(isWednesdayRaidHour(now, "Europe/London")).toBe(true)
    expect(getRaidHourLocalState(now, "Europe/London")).toMatchObject({
      dateKey: "2026-08-19",
      weekday: "Wed",
      hour: 18,
      timeZone: "Europe/London",
    })
  })

  it("keeps 18:00 local time when the UTC offset changes", () => {
    expect(
      isWednesdayRaidHour(
        new Date("2026-12-02T18:00:00.000Z"),
        "Europe/London",
      ),
    ).toBe(true)
  })

  it("uses each device timezone rather than server time", () => {
    const now = new Date("2026-08-19T22:00:00.000Z")

    expect(isWednesdayRaidHour(now, "America/New_York")).toBe(true)
    expect(isWednesdayRaidHour(now, "Europe/London")).toBe(false)
  })

  it("falls back to Europe/London for an invalid timezone", () => {
    expect(normalisePushTimeZone("Not/AZone")).toBe("Europe/London")
  })

  it("builds the current five-star hundo CP notification", () => {
    const payload = buildRaidHourPushPayload(lunalaRaid, "2026-08-19")

    expect(payload).toEqual({
      title: "5★ Raid Hour: Lunala",
      body: "Hundo: 2310 CP • Weather boosted: 2887 CP",
      tag: "raid-hour-2026-08-19",
      renotify: false,
      url: "/tools/raids#raid-five-star-five-star-example",
    })
  })

  it("hides both CP values for the rare easter egg recipient", () => {
    const payload = buildRaidHourPushPayload(lunalaRaid, "2026-08-19", true)

    expect(payload.body).toBe("Hundo - 15/15/15")
    expect(payload.body).not.toContain("2310")
    expect(payload.body).not.toContain("2887")
  })
})