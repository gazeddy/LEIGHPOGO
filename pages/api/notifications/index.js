import { getServerSession } from "next-auth/next"
import { authOptions } from "../auth/[...nextauth]"
import prisma from "../../../lib/prisma"
import {
  serializeTradeNotification,
  tradeNotificationInclude,
} from "../../../lib/tradeNotifications"
import {
  friendCodeGrabNotificationInclude,
  serializeFriendCodeGrabNotification,
} from "../../../lib/friendCodeNotifications"

const sessionUserId = (session) => {
  const userId = Number(session?.user?.id)
  return Number.isInteger(userId) ? userId : null
}

const serializeTradeInboxNotification = (notification) => ({
  kind: "TRADE",
  ...serializeTradeNotification(notification),
})

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions)
  const userId = sessionUserId(session)

  if (!userId) {
    return res.status(401).json({ error: "You must be logged in." })
  }

  res.setHeader("Cache-Control", "private, no-store")

  if (req.method === "GET") {
    const [tradeUnreadCount, friendCodeUnreadCount] = await Promise.all([
      prisma.tradeNotification.count({
        where: {
          ownerId: userId,
          readAt: null,
        },
      }),
      prisma.friendCodeGrabNotification.count({
        where: {
          ownerId: userId,
          readAt: null,
        },
      }),
    ])
    const unreadCount = tradeUnreadCount + friendCodeUnreadCount

    if (req.query.summary === "1") {
      return res.status(200).json({ unreadCount })
    }

    const [tradeNotifications, friendCodeNotifications] = await Promise.all([
      prisma.tradeNotification.findMany({
        where: { ownerId: userId },
        include: tradeNotificationInclude,
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.friendCodeGrabNotification.findMany({
        where: { ownerId: userId },
        include: friendCodeGrabNotificationInclude,
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ])

    const notifications = [
      ...tradeNotifications.map(serializeTradeInboxNotification),
      ...friendCodeNotifications.map(serializeFriendCodeGrabNotification),
    ]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 50)

    return res.status(200).json({
      unreadCount,
      notifications,
    })
  }

  if (req.method === "PUT") {
    const readAt = new Date()
    const [tradeResult, friendCodeResult] = await Promise.all([
      prisma.tradeNotification.updateMany({
        where: {
          ownerId: userId,
          readAt: null,
        },
        data: { readAt },
      }),
      prisma.friendCodeGrabNotification.updateMany({
        where: {
          ownerId: userId,
          readAt: null,
        },
        data: { readAt },
      }),
    ])

    return res.status(200).json({
      updated: tradeResult.count + friendCodeResult.count,
      unreadCount: 0,
    })
  }

  res.setHeader("Allow", ["GET", "PUT"])
  return res.status(405).json({ error: "Method not allowed" })
}
