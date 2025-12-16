import crypto from "crypto"

function normalizeUrl(url) {
  if (!url) return null
  return url.startsWith("http") ? url : `https://${url}`
}

export function ensureNextAuthUrl() {
  const candidates = [
    process.env.NEXTAUTH_URL,
    process.env.SITE_URL,
    process.env.VERCEL_URL,
    process.env.DEPLOYMENT_URL,
    process.env.RENDER_EXTERNAL_URL,
  ]

  for (const candidate of candidates) {
    const normalized = normalizeUrl(candidate)
    if (normalized) {
      process.env.NEXTAUTH_URL = normalized
      return normalized
    }
  }

  const port = process.env.PORT || 3000
  const host = process.env.HOST || "localhost"
  const fallback = `http://${host}:${port}`
  process.env.NEXTAUTH_URL = fallback
  return fallback
}

export function getNextAuthSecret() {
  const secret = process.env.NEXTAUTH_SECRET
  if (secret && secret !== "your-secret-key-change-in-production") {
    return secret
  }

  const generated = crypto.randomBytes(32).toString("hex")
  process.env.NEXTAUTH_SECRET = generated
  return generated
}
