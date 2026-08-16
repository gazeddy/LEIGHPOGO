const {
  RAID_HOUR_EASTER_EGG_COOLDOWN_WEEKS,
  RAID_HOUR_EASTER_EGG_ONE_IN,
  isRaidHourEasterEggOwnerEligible,
  selectRaidHourEasterEggOwner,
} = require("../../lib/raid-hour-push")

describe("Raid Hour 15/15/15 easter egg selection", () => {
  it("uses a one-in-100 weekly chance", () => {
    expect(RAID_HOUR_EASTER_EGG_ONE_IN).toBe(100)
  })

  it("keeps a recipient out of the next four Raid Hours", () => {
    expect(RAID_HOUR_EASTER_EGG_COOLDOWN_WEEKS).toBe(4)

    const lastSelected = "2026-08-19"
    expect(isRaidHourEasterEggOwnerEligible("2026-08-26", lastSelected)).toBe(false)
    expect(isRaidHourEasterEggOwnerEligible("2026-09-02", lastSelected)).toBe(false)
    expect(isRaidHourEasterEggOwnerEligible("2026-09-09", lastSelected)).toBe(false)
    expect(isRaidHourEasterEggOwnerEligible("2026-09-16", lastSelected)).toBe(false)
    expect(isRaidHourEasterEggOwnerEligible("2026-09-23", lastSelected)).toBe(true)
  })

  it("keeps the current week's selected user eligible so retries cannot reroll", () => {
    expect(
      isRaidHourEasterEggOwnerEligible("2026-08-19", "2026-08-19"),
    ).toBe(true)
  })

  it("selects one stable user when the weekly roll hits", () => {
    const ownerIds = [41, 12, 41, 99, 7]
    const first = selectRaidHourEasterEggOwner(
      "2026-08-19",
      ownerIds,
      "test-secret",
      1,
    )
    const retry = selectRaidHourEasterEggOwner(
      "2026-08-19",
      ownerIds,
      "test-secret",
      1,
    )

    expect([7, 12, 41, 99]).toContain(first)
    expect(retry).toBe(first)
  })

  it("does not select anyone without the scheduler secret", () => {
    expect(
      selectRaidHourEasterEggOwner("2026-08-19", [1, 2, 3], "", 1),
    ).toBeNull()
  })
})
