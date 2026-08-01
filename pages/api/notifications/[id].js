import { getServerSession } from "next-auth/next"
import { authOptions } from "../auth/[...nextauth]"
import prisma from "../../../lib/prisma"
import {
  serializeTradeNotification,
  tradeNotificationInclude,
} from "../../../lib/tradeNotifications"

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions)
  const userId = Number(session?.user?.id)

  if (!Number.isInteger(userId)) {
    return res.status(401).json({ error: "You must be logged in." })
  }

  if (req.method !== "PUT") {
    res.setHeader("Allow", ["PUT"])
    return res.status(405).json({ error: "Method not allowed" })
  }

  const notificationId = Number(req.query.id)

  if (!Number.isInteger(notificationId)) {
    return res.status(400).json({ error: "Invalid notification ID" })
  }

  const notification = await prisma.tradeNotification.findFirst({
    where: {
      id: notificationId,
      ownerId: userId,
    },
    select: { id: true },
  })

  if (!notification) {
    return res.status(404).json({ error: "Notification not found" })
  }

  const updated = await prisma.tradeNotification.update({
    where: { id: notificationId },
    data: { readAt: new Date() },
    include: tradeNotificationInclude,
  })

  return res.status(200).json(serializeTradeNotification(updated))
}
