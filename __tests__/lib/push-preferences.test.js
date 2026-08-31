const {
  DEFAULT_PUSH_PREFERENCES,
  PUSH_PREFERENCE_KEYS,
  normalizePushPreferences,
} = require("../../lib/pushPreferences")

describe("push notification preferences", () => {
  it("defaults raids, trades and new gyms to enabled", () => {
    expect(DEFAULT_PUSH_PREFERENCES).toEqual({
      [PUSH_PREFERENCE_KEYS.RAIDS]: true,
      [PUSH_PREFERENCE_KEYS.TRADES]: true,
      [PUSH_PREFERENCE_KEYS.NEW_GYMS]: true,
    })
  })

  it("applies stored opt-outs without changing unrelated defaults", () => {
    expect(
      normalizePushPreferences([
        { tickerType: PUSH_PREFERENCE_KEYS.RAIDS, enabled: false },
        { tickerType: PUSH_PREFERENCE_KEYS.NEW_GYMS, enabled: false },
        { tickerType: "EVENTS", enabled: false },
      ]),
    ).toEqual({
      [PUSH_PREFERENCE_KEYS.RAIDS]: false,
      [PUSH_PREFERENCE_KEYS.TRADES]: true,
      [PUSH_PREFERENCE_KEYS.NEW_GYMS]: false,
    })
  })
})
