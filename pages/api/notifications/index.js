import { getServerSession } from "next-auth/next"
import { authOptions } from "../auth/[...nextauth]"
import prisma from "../../../lib/prisma"
import {
  serializeTradeNotification,
  tradeNotificationInclude,
} from "../../../lib/tradeNotifications"

const sessionUserId = (session) => {
  const userId = Number(session?.user?.id)
  return Number.isInteger(userId) ? userId : null
}

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions)
  const userId = sessionUserId(session)

  if (!userId) {
    return res.status(401).json({ error: "You must be logged in." })
  }

  res.setHeader("Cache-Control", "private, no-store")

  if (req.method === "GET") {
    const unreadCount = await prisma.tradeNotification.count({
      where: {
        ownerId: userId,
        readAt: null,
      },
    })

    if (req.query.summary === "1") {
      return res.status(200).json({ unreadCount })
    }

    const notifications = await prisma.tradeNotification.findMany({
      where: { ownerId: userId },
      include: tradeNotificationInclude,
      orderBy: { createdAt: "desc" },
      take: 50,
    })

    return res.status(200).json({
      unreadCount,
      notifications: notifications.map(serializeTradeNotification),
    })
  }

  if (req.method === "PUT") {
    const result = await prisma.tradeNotification.updateMany({
      where: {
        ownerId: userId,
        readAt: null,
      },
      data: { readAt: new Date() },
    })

    return res.status(200).json({ updated: result.count, unreadCount: 0 })
  }

  res.setHeader("Allow", ["GET", "PUT"])
  return res.status(405).json({ error: "Method not allowed" })
}
