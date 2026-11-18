import { currentGiftQr, GIFT_QR_WINDOW_MS, validGiftQr } from "../../lib/giftQr"

describe("24-hour rotating community gift QR", () => {
  const originalSecret = process.env.GIFT_QR_SECRET
  beforeAll(() => { process.env.GIFT_QR_SECRET = "integration-test-only-gift-secret" })
  afterAll(() => {
    if (originalSecret === undefined) delete process.env.GIFT_QR_SECRET
    else process.env.GIFT_QR_SECRET = originalSecret
  })

  test("same token within one 24-hour window, different token next window", () => {
    const time = 42 * GIFT_QR_WINDOW_MS + 120000
    const first = currentGiftQr(time)
    expect(currentGiftQr(time + 4000).token).toBe(first.token)
    expect(first.expiresAt).toBe(new Date(43 * GIFT_QR_WINDOW_MS).toISOString())
    expect(currentGiftQr(time + GIFT_QR_WINDOW_MS).token).not.toBe(first.token)
  })

  test("expired token cannot be used after rollover", () => {
    const time = 42 * GIFT_QR_WINDOW_MS + 120000
    const token = currentGiftQr(time).token
    expect(validGiftQr(token, time)).toBe(true)
    expect(validGiftQr(token, 43 * GIFT_QR_WINDOW_MS)).toBe(false)
    expect(validGiftQr(currentGiftQr(43 * GIFT_QR_WINDOW_MS).token, 43 * GIFT_QR_WINDOW_MS)).toBe(true)
  })

  test("tampered and missing QR tokens are rejected", () => {
    const time = 42 * GIFT_QR_WINDOW_MS + 120000
    const token = currentGiftQr(time).token
    expect(validGiftQr(token.slice(0, -1) + (token.endsWith("a") ? "b" : "a"), time)).toBe(false)
    expect(validGiftQr(undefined, time)).toBe(false)
    expect(validGiftQr("/gifts", time)).toBe(false)
  })
})
