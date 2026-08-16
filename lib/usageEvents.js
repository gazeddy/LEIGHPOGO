import prisma from "./prisma"
import { isUsageEventType } from "./usageEventTypes"

const normalizePath = (value) => {
  const path = String(value || "").trim()
  if (!path.startsWith("/")) return null
  return path.slice(0, 200)
}

const normalizeMetadata = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null

  try {
    const serialized = JSON.stringify(value)
    return serialized.length <= 1000 ? serialized : null
  } catch {
    return null
  }
}

export const classifyUsageDevice = (userAgent) => {
  const value = String(userAgent || "")

  if (/iPad|Tablet|PlayBook|Silk|Kindle|Android(?!.*Mobile)/i.test(value)) {
    return "tablet"
  }

  if (/Mobi|Android|iPhone|iPod/i.test(value)) {
    return "mobile"
  }

  return "desktop"
}

export async function recordUsageEvent({
  type,
  ownerId,
  path,
  userAgent,
  metadata,
}) {
  const normalizedType = String(type || "").trim().toUpperCase()
  const normalizedOwnerId = Number(ownerId)

  if (!isUsageEventType(normalizedType) || !Number.isInteger(normalizedOwnerId)) {
    return null
  }

  if (!prisma.usageEvent?.create) {
    return null
  }

  try {
    return await prisma.usageEvent.create({
      data: {
        type: normalizedType,
        ownerId: normalizedOwnerId,
        path: normalizePath(path),
        device: classifyUsageDevice(userAgent),
        metadata: normalizeMetadata(metadata),
      },
    })
  } catch (error) {
    // Analytics must never block a real feature action. A missing table is
    // expected in isolated tests and on a server before the V3 migration runs.
    if (error?.code !== "P2021") {
      console.error("Unable to record usage event", error)
    }
    return null
  }
}
