import crypto from "crypto"
import fs from "fs"
import path from "path"

const DEFAULT_SECRET = "your-secret-key-change-in-production"
const SECRET_FILE = path.join(process.cwd(), ".nextauth-secret")

function readPersistedSecret() {
  try {
    if (fs.existsSync(SECRET_FILE)) {
      const stored = fs.readFileSync(SECRET_FILE, "utf8").trim()
      if (stored) return stored
    }
  } catch (error) {
    console.warn("Unable to read persisted NextAuth secret", error)
  }

  return null
}

function persistSecret(secret) {
  try {
    fs.writeFileSync(SECRET_FILE, secret, { mode: 0o600 })
  } catch (error) {
    console.warn("Unable to persist NextAuth secret", error)
  }
}

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
  if (secret && secret !== DEFAULT_SECRET) {
    return secret
  }

  const persisted = readPersistedSecret()
  if (persisted) {
    process.env.NEXTAUTH_SECRET = persisted
    return persisted
  }

  const generated = crypto.randomBytes(32).toString("hex")
  process.env.NEXTAUTH_SECRET = generated
  persistSecret(generated)
  return generated
}
