import { getServerSession } from "next-auth/next"
import { authOptions } from "./auth/[...nextauth]"
import prisma from "../../lib/prisma"
import {
  TICKER_TYPE_VALUES,
  normalizeTickerPreferences,
} from "../../lib/tickerPreferences"

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions)

  if (!session) {
    return res.status(401).json({ error: "You must be logged in." })
  }

  const ownerId = Number(session.user.id)

  if (req.method === "GET") {
    try {
      const rows = await prisma.userTickerPreference.findMany({
        where: { ownerId },
        select: { tickerType: true, enabled: true },
      })

      return res.status(200).json({
        preferences: normalizeTickerPreferences(rows),
      })
    } catch (error) {
      console.error("Failed to load ticker preferences", error)
      return res.status(500).json({ error: "Unable to load ticker preferences" })
    }
  }

  if (req.method === "PUT") {
    const { tickerType, enabled } = req.body || {}

    if (!TICKER_TYPE_VALUES.includes(tickerType)) {
      return res.status(400).json({ error: "Unknown ticker type" })
    }

    if (typeof enabled !== "boolean") {
      return res.status(400).json({ error: "Ticker preference must be true or false" })
    }

    try {
      const preference = await prisma.userTickerPreference.upsert({
        where: {
          ownerId_tickerType: {
            ownerId,
            tickerType,
          },
        },
        update: { enabled },
        create: {
          ownerId,
          tickerType,
          enabled,
        },
        select: { tickerType: true, enabled: true },
      })

      return res.status(200).json(preference)
    } catch (error) {
      console.error("Failed to save ticker preference", error)
      return res.status(500).json({ error: "Unable to save ticker preference" })
    }
  }

  res.setHeader("Allow", ["GET", "PUT"])
  return res.status(405).json({ error: "Method not allowed" })
}
