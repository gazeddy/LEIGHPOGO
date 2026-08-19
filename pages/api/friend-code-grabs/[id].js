import { getServerSession } from "next-auth/next"
import { authOptions } from "../auth/[...nextauth]"
import prisma from "../../../lib/prisma"
import {
  friendCodeGrabNotificationInclude,
  serializeFriendCodeGrabNotification,
} from "../../../lib/friendCodeNotifications"

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions)
  const userId = Number(session?.user?.id)

  if (!Number.isInteger(userId)) {
    return res.status(401).json({ error: "You must be logged in." })
  }

  res.setHeader("Cache-Control", "private, no-store")

  if (!["PUT", "DELETE"].includes(req.method)) {
    res.setHeader("Allow", ["PUT", "DELETE"])
    return res.status(405).json({ error: "Method not allowed" })
  }

  const notificationId = Number(req.query.id)

  if (!Number.isInteger(notificationId)) {
    return res.status(400).json({ error: "Invalid notification ID" })
  }

  const notification = await prisma.friendCodeGrabNotification.findFirst({
    where: {
      id: notificationId,
      ownerId: userId,
    },
    select: { id: true },
  })

  if (!notification) {
    return res.status(404).json({ error: "Notification not found" })
  }

  if (req.method === "DELETE") {
    await prisma.friendCodeGrabNotification.delete({ where: { id: notificationId } })
    return res.status(200).json({ deleted: true, id: notificationId })
  }

  const updated = await prisma.friendCodeGrabNotification.update({
    where: { id: notificationId },
    data: { readAt: new Date() },
    include: friendCodeGrabNotificationInclude,
  })

  return res.status(200).json(serializeFriendCodeGrabNotification(updated))
}
