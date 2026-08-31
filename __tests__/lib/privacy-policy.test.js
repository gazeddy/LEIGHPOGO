const {
  PRIVACY_POLICY_VERSION,
  hasCurrentPrivacyAcceptance,
  requiresPrivacyAcknowledgement,
} = require("../../lib/privacyPolicy")

describe("V4 privacy policy versioning", () => {
  it("recognises only the current policy version", () => {
    expect(hasCurrentPrivacyAcceptance(PRIVACY_POLICY_VERSION)).toBe(true)
    expect(hasCurrentPrivacyAcceptance("v3-legacy")).toBe(false)
    expect(hasCurrentPrivacyAcceptance(null)).toBe(false)
  })

  it("gates an authenticated user with no acceptance or an old acceptance", () => {
    expect(
      requiresPrivacyAcknowledgement({ authenticated: true, policyVersion: null }),
    ).toBe(true)
    expect(
      requiresPrivacyAcknowledgement({ authenticated: true, policyVersion: "v3-legacy" }),
    ).toBe(true)
  })

  it("does not gate anonymous users or users on the current version", () => {
    expect(
      requiresPrivacyAcknowledgement({ authenticated: false, policyVersion: null }),
    ).toBe(false)
    expect(
      requiresPrivacyAcknowledgement({
        authenticated: true,
        policyVersion: PRIVACY_POLICY_VERSION,
      }),
    ).toBe(false)
  })
})
