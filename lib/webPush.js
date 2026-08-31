import crypto from "crypto"
import prisma from "./prisma"
import { PUSH_PREFERENCE_KEYS, pushPreferenceEnabled } from "./pushPreferences"

const P256_CURVE = "prime256v1"
const WEB_PUSH_INFO = Buffer.from("WebPush: info")
const CEK_INFO = Buffer.from("Content-Encoding: aes128gcm")
const NONCE_INFO = Buffer.from("Content-Encoding: nonce")
const RECORD_SIZE = 4096

const base64UrlToBuffer = (value) => Buffer.from(String(value || ""), "base64url")
const hmacSha256 = (key, data) =>
  crypto.createHmac("sha256", key).update(data).digest()

const hkdfExpandSingle = (prk, info, length) =>
  hmacSha256(prk, Buffer.concat([info, Buffer.from([0x01])])).subarray(0, length)

const encodeInfo = (label) => Buffer.concat([label, Buffer.from([0x00])])

const validateReceiverKey = (publicKey) => {
  if (publicKey.length !== 65 || publicKey[0] !== 0x04) {
    throw new Error("Invalid Web Push p256dh public key.")
  }
}

const validateAuthSecret = (authSecret) => {
  if (authSecret.length !== 16) {
    throw new Error("Invalid Web Push authentication secret.")
  }
}

const preferenceKeyForPayload = (payload) => {
  const tag = String(payload?.tag || "").trim().toLowerCase()
  if (tag.startsWith("raid-")) return PUSH_PREFERENCE_KEYS.RAIDS
  if (tag.startsWith("trade-")) return PUSH_PREFERENCE_KEYS.TRADES
  if (tag.startsWith("new-gym")) return PUSH_PREFERENCE_KEYS.NEW_GYMS
  return null
}

const deliveryPreferenceEnabled = async (endpoint, payload) => {
  const preferenceKey = preferenceKeyForPayload(payload)
  if (!preferenceKey) return true

  const subscription = await prisma.pushSubscription.findUnique({
    where: { endpoint },
    select: { ownerId: true },
  })

  if (!subscription) return true
  return pushPreferenceEnabled(subscription.ownerId, preferenceKey)
}

export const encryptWebPushPayload = (
  subscription,
  payload,
  { salt: suppliedSalt, senderPrivateKey: suppliedPrivateKey } = {},
) => {
  const receiverPublic = base64UrlToBuffer(subscription?.p256dh)
  const authSecret = base64UrlToBuffer(subscription?.auth)
  validateReceiverKey(receiverPublic)
  validateAuthSecret(authSecret)

  const sender = crypto.createECDH(P256_CURVE)
  if (suppliedPrivateKey) {
    sender.setPrivateKey(
      Buffer.isBuffer(suppliedPrivateKey)
        ? suppliedPrivateKey
        : base64UrlToBuffer(suppliedPrivateKey),
    )
  } else {
    sender.generateKeys()
  }

  const senderPublic = sender.getPublicKey(null, "uncompressed")
  const ecdhSecret = sender.computeSecret(receiverPublic)
  const prkKey = hmacSha256(authSecret, ecdhSecret)
  const keyInfo = Buffer.concat([
    WEB_PUSH_INFO,
    Buffer.from([0x00]),
    receiverPublic,
    senderPublic,
  ])
  const ikm = hkdfExpandSingle(prkKey, keyInfo, 32)

  const salt = suppliedSalt
    ? Buffer.isBuffer(suppliedSalt)
      ? suppliedSalt
      : base64UrlToBuffer(suppliedSalt)
    : crypto.randomBytes(16)

  if (salt.length !== 16) {
    throw new Error("Web Push salt must be 16 bytes.")
  }

  const prk = hmacSha256(salt, ikm)
  const cek = hkdfExpandSingle(prk, encodeInfo(CEK_INFO), 16)
  const nonce = hkdfExpandSingle(prk, encodeInfo(NONCE_INFO), 12)
  const encodedPayload = Buffer.from(
    typeof payload === "string" ? payload : JSON.stringify(payload),
  )
  const plaintext = Buffer.concat([encodedPayload, Buffer.from([0x02])])

  if (plaintext.length + 16 >= RECORD_SIZE) {
    throw new Error("Web Push payload is too large.")
  }

  const cipher = crypto.createCipheriv("aes-128-gcm", cek, nonce)
  const ciphertext = Buffer.concat([
    cipher.update(plaintext),
    cipher.final(),
    cipher.getAuthTag(),
  ])

  const header = Buffer.alloc(21)
  salt.copy(header, 0)
  header.writeUInt32BE(RECORD_SIZE, 16)
  header.writeUInt8(senderPublic.length, 20)

  return {
    body: Buffer.concat([header, senderPublic, ciphertext]),
    senderPublic,
    salt,
  }
}

const vapidKeyPairFromEnvironment = () => {
  const publicKey = String(process.env.VAPID_PUBLIC_KEY || "").trim()
  const privateKey = String(process.env.VAPID_PRIVATE_KEY || "").trim()
  const subject = String(process.env.VAPID_SUBJECT || "").trim()

  if (!publicKey || !privateKey || !subject) {
    throw new Error(
      "VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT are required.",
    )
  }

  const publicBytes = base64UrlToBuffer(publicKey)
  const privateBytes = base64UrlToBuffer(privateKey)

  if (
    publicBytes.length !== 65 ||
    publicBytes[0] !== 0x04 ||
    privateBytes.length !== 32
  ) {
    throw new Error("Invalid VAPID P-256 key pair.")
  }

  if (!subject.startsWith("mailto:") && !subject.startsWith("https://")) {
    throw new Error("VAPID_SUBJECT must be a mailto: or https: URI.")
  }

  return { publicKey, privateKey, subject, publicBytes, privateBytes }
}

export const isWebPushConfigured = () => {
  try {
    vapidKeyPairFromEnvironment()
    return true
  } catch {
    return false
  }
}

export const createVapidAuthorization = (endpoint, now = Date.now()) => {
  const { publicKey, subject, publicBytes, privateBytes } =
    vapidKeyPairFromEnvironment()

  const audience = new URL(endpoint).origin
  const header = { typ: "JWT", alg: "ES256" }
  const claims = {
    aud: audience,
    exp: Math.floor(now / 1000) + 12 * 60 * 60,
    sub: subject,
  }

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString("base64url")
  const encodedClaims = Buffer.from(JSON.stringify(claims)).toString("base64url")
  const signingInput = `${encodedHeader}.${encodedClaims}`

  const privateKeyObject = crypto.createPrivateKey({
    key: {
      kty: "EC",
      crv: "P-256",
      x: publicBytes.subarray(1, 33).toString("base64url"),
      y: publicBytes.subarray(33, 65).toString("base64url"),
      d: privateBytes.toString("base64url"),
    },
    format: "jwk",
  })

  const signature = crypto.sign("sha256", Buffer.from(signingInput), {
    key: privateKeyObject,
    dsaEncoding: "ieee-p1363",
  })

  return {
    authorization: `vapid t=${signingInput}.${signature.toString("base64url")}, k=${publicKey}`,
    audience,
  }
}

export const sendWebPush = async (
  subscription,
  payload,
  { ttl = 300, fetchImpl = fetch } = {},
) => {
  const endpoint = String(subscription?.endpoint || "").trim()
  if (!endpoint) {
    throw new Error("Push subscription endpoint is required.")
  }

  if (!(await deliveryPreferenceEnabled(endpoint, payload))) {
    return {
      ok: true,
      status: null,
      expired: false,
      suppressed: true,
    }
  }

  const encrypted = encryptWebPushPayload(subscription, payload)
  const { authorization } = createVapidAuthorization(endpoint)

  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(ttl),
    },
    body: encrypted.body,
  })

  return {
    ok: response.ok,
    status: response.status,
    expired: response.status === 404 || response.status === 410,
    suppressed: false,
  }
}
