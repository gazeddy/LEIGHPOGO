import { getServerSession } from "next-auth/next"
import { authOptions } from "../auth/[...nextauth]"
import prisma from "../../../lib/prisma"
import {
  PUSH_PREFERENCE_VALUES,
  normalizePushPreferences,
} from "../../../lib/pushPreferences"

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions)
  const ownerId = Number(session?.user?.id)

  if (!Number.isInteger(ownerId)) {
    return res.status(401).json({ error: "You must be logged in." })
  }

  res.setHeader("Cache-Control", "private, no-store")

  if (req.method === "GET") {
    const rows = await prisma.userTickerPreference.findMany({
      where: {
        ownerId,
        tickerType: { in: PUSH_PREFERENCE_VALUES },
      },
      select: { tickerType: true, enabled: true },
    })

    return res.status(200).json({
      preferences: normalizePushPreferences(rows),
    })
  }

  if (req.method === "PUT") {
    const { key, enabled } = req.body || {}

    if (!PUSH_PREFERENCE_VALUES.includes(key)) {
      return res.status(400).json({ error: "Unknown push notification preference." })
    }
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ error: "Push preference must be true or false." })
    }

    const saved = await prisma.userTickerPreference.upsert({
      where: {
        ownerId_tickerType: {
          ownerId,
          tickerType: key,
        },
      },
      update: { enabled },
      create: {
        ownerId,
        tickerType: key,
        enabled,
      },
      select: { tickerType: true, enabled: true },
    })

    return res.status(200).json({
      key: saved.tickerType,
      enabled: saved.enabled,
    })
  }

  res.setHeader("Allow", ["GET", "PUT"])
  return res.status(405).json({ error: "Method not allowed" })
}
