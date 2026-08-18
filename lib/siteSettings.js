import prisma from "./prisma"

export const CAMPFIRE_URL_KEY = "campfireUrl"

function normaliseExternalUrl(value) {
  const trimmed = typeof value === "string" ? value.trim() : ""

  if (!trimmed) return null

  let parsed
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error("Campfire URL must be a valid URL")
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Campfire URL must use http or https")
  }

  return parsed.toString()
}

export async function getCampfireUrl() {
  const setting = await prisma.siteSetting.findUnique({
    where: { key: CAMPFIRE_URL_KEY },
    select: { value: true },
  })

  return setting?.value || null
}

export async function setCampfireUrl(value) {
  const url = normaliseExternalUrl(value)

  if (!url) {
    await prisma.siteSetting.deleteMany({
      where: { key: CAMPFIRE_URL_KEY },
    })
    return null
  }

  await prisma.siteSetting.upsert({
    where: { key: CAMPFIRE_URL_KEY },
    update: { value: url },
    create: { key: CAMPFIRE_URL_KEY, value: url },
  })

  return url
}
