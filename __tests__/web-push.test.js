const crypto = require("crypto")
const {
  createVapidAuthorization,
  encryptWebPushPayload,
} = require("../lib/webPush")

describe("Web Push protocol", () => {
  it("matches the RFC 8291 encryption example byte-for-byte", () => {
    const encrypted = encryptWebPushPayload(
      {
        p256dh: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
        auth: "BTBZMqHH6r4Tts7J_aSIgg",
      },
      "When I grow up, I want to be a watermelon",
      {
        senderPrivateKey: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
        salt: "DGv6ra1nlYgDCS1FRnbzlw",
      },
    )

    expect(encrypted.body.toString("base64url")).toBe(
      "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
    )
  })

  it("creates a verifiable ES256 VAPID token for the push-service origin", () => {
    const original = {
      publicKey: process.env.VAPID_PUBLIC_KEY,
      privateKey: process.env.VAPID_PRIVATE_KEY,
      subject: process.env.VAPID_SUBJECT,
    }

    try {
      const privateKey = Buffer.alloc(32)
      privateKey[31] = 1
      const ecdh = crypto.createECDH("prime256v1")
      ecdh.setPrivateKey(privateKey)
      const publicBytes = ecdh.getPublicKey()

      process.env.VAPID_PUBLIC_KEY = publicBytes.toString("base64url")
      process.env.VAPID_PRIVATE_KEY = privateKey.toString("base64url")
      process.env.VAPID_SUBJECT = "mailto:test@example.com"

      const fixedNow = Date.UTC(2026, 7, 15, 15, 30, 0)
      const { authorization, audience } = createVapidAuthorization(
        "https://push.example.net/p/example",
        fixedNow,
      )

      expect(audience).toBe("https://push.example.net")

      const match = authorization.match(/^vapid t=([^,]+), k=(.+)$/)
      expect(match).not.toBeNull()
      expect(match[2]).toBe(process.env.VAPID_PUBLIC_KEY)

      const [encodedHeader, encodedClaims, encodedSignature] = match[1].split(".")
      const header = JSON.parse(Buffer.from(encodedHeader, "base64url").toString())
      const claims = JSON.parse(Buffer.from(encodedClaims, "base64url").toString())

      expect(header).toEqual({ typ: "JWT", alg: "ES256" })
      expect(claims.aud).toBe("https://push.example.net")
      expect(claims.sub).toBe("mailto:test@example.com")
      expect(claims.exp).toBe(Math.floor(fixedNow / 1000) + 12 * 60 * 60)

      const publicKey = crypto.createPublicKey({
        key: {
          kty: "EC",
          crv: "P-256",
          x: publicBytes.subarray(1, 33).toString("base64url"),
          y: publicBytes.subarray(33, 65).toString("base64url"),
        },
        format: "jwk",
      })

      expect(
        crypto.verify(
          "sha256",
          Buffer.from(`${encodedHeader}.${encodedClaims}`),
          { key: publicKey, dsaEncoding: "ieee-p1363" },
          Buffer.from(encodedSignature, "base64url"),
        ),
      ).toBe(true)
    } finally {
      if (original.publicKey === undefined) delete process.env.VAPID_PUBLIC_KEY
      else process.env.VAPID_PUBLIC_KEY = original.publicKey

      if (original.privateKey === undefined) delete process.env.VAPID_PRIVATE_KEY
      else process.env.VAPID_PRIVATE_KEY = original.privateKey

      if (original.subject === undefined) delete process.env.VAPID_SUBJECT
      else process.env.VAPID_SUBJECT = original.subject
    }
  })
})
