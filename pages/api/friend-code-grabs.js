import { getServerSession } from "next-auth/next"
import { authOptions } from "./auth/[...nextauth]"
import prisma from "../../lib/prisma"
import {
  friendCodeGrabNotificationInclude,
  serializeFriendCodeGrabNotification,
} from "../../lib/friendCodeNotifications"
import { recordUsageEvent } from "../../lib/usageEvents"

const DEDUPE_WINDOW_MS = 5 * 60 * 1000

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions)
  const userId = Number(session?.user?.id)

  if (!Number.isInteger(userId)) {
    return res.status(401).json({ error: "You must be logged in." })
  }

  res.setHeader("Cache-Control", "private, no-store")

  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"])
    return res.status(405).json({ error: "Method not allowed" })
  }

  const entryId = Number(req.body?.entryId)

  if (!Number.isInteger(entryId)) {
    return res.status(400).json({ error: "Invalid friend-code entry ID" })
  }

  const entry = await prisma.entry.findUnique({
    where: { id: entryId },
    select: {
      id: true,
      ownerId: true,
      trainerName: true,
    },
  })

  if (!entry) {
    return res.status(404).json({ error: "Friend-code entry not found" })
  }

  await recordUsageEvent({
    type: "FRIEND_CODE_COPIED",
    ownerId: userId,
    path: "/friend-codes",
    userAgent: req.headers["user-agent"],
    metadata: { entryId },
  })

  if (entry.ownerId === userId) {
    return res.status(200).json({ created: false, self: true })
  }

  const cutoff = new Date(Date.now() - DEDUPE_WINDOW_MS)
  const existing = await prisma.friendCodeGrabNotification.findFirst({
    where: {
      ownerId: entry.ownerId,
      copiedById: userId,
      entryId,
      createdAt: { gte: cutoff },
    },
    include: friendCodeGrabNotificationInclude,
    orderBy: { createdAt: "desc" },
  })

  if (existing) {
    return res.status(200).json({
      created: false,
      notification: serializeFriendCodeGrabNotification(existing),
    })
  }

  const notification = await prisma.friendCodeGrabNotification.create({
    data: {
      ownerId: entry.ownerId,
      copiedById: userId,
      entryId,
    },
    include: friendCodeGrabNotificationInclude,
  })

  return res.status(201).json({
    created: true,
    notification: serializeFriendCodeGrabNotification(notification),
  })
}
