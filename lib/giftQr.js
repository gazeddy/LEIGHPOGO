import { createHmac, timingSafeEqual } from "node:crypto"

// Shared QR codes rotate at 00:00 UTC, exactly 24 hours apart.
// Tokens have no database state and work across server restarts.
export const GIFT_QR_WINDOW_MS = 24 * 60 * 60 * 1000
const SIGNING_PURPOSE = "leighpogo-community-gift-qr-v1"

function signingSecret() {
  const secret = process.env.GIFT_QR_SECRET || process.env.NEXTAUTH_SECRET
  if (!secret) throw new Error("Gift QR signing secret is not configured")
  return secret
}

function signature(windowId) {
  return createHmac("sha256", signingSecret())
    .update(SIGNING_PURPOSE + ":" + windowId)
    .digest("hex")
}

export function currentGiftQr(now = Date.now()) {
  const windowId = Math.floor(now / GIFT_QR_WINDOW_MS)
  return {
    token: windowId + "." + signature(windowId),
    expiresAt: new Date((windowId + 1) * GIFT_QR_WINDOW_MS).toISOString(),
  }
}

export function validGiftQr(token, now = Date.now()) {
  if (typeof token !== "string" || !/^\d{1,10}\.[a-f0-9]{64}$/.test(token)) return false
  const dot = token.indexOf(".")
  const windowId = Number(token.slice(0, dot))
  if (!Number.isSafeInteger(windowId) || windowId !== Math.floor(now / GIFT_QR_WINDOW_MS)) return false
  const expected = Buffer.from(signature(windowId), "hex")
  const actual = Buffer.from(token.slice(dot + 1), "hex")
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
