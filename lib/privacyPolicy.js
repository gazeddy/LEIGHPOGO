export const PRIVACY_POLICY_VERSION = "v4-2026-11-18"
export const PRIVACY_POLICY_EFFECTIVE_DATE = "18 November 2026"

export function hasCurrentPrivacyAcceptance(policyVersion) {
  return String(policyVersion || "") === PRIVACY_POLICY_VERSION
}

export function requiresPrivacyAcknowledgement({ authenticated, policyVersion }) {
  return Boolean(authenticated) && !hasCurrentPrivacyAcceptance(policyVersion)
}
