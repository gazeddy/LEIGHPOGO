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

const POKEDEX_NOTIFICATION_STATUSES = ["COMPLETE", "FAILED", "ACCEPTED"]
const POKEDEX_UNREAD_STATUSES = ["COMPLETE", "FAILED"]
const NOTIFICATION_LIST_LIMIT = 20

const sessionUserId = (session) => {
  const userId = Number(session?.user?.id)
  return Number.isInteger(userId) ? userId : null
}

const serializeTradeInboxNotification = (notification) => ({
  kind: "TRADE",
  ...serializeTradeNotification(notification),
})

const serializePokedexImportNotification = (job) => ({
  kind: "POKEDEX_IMPORT",
  id: job.id,
  jobId: job.id,
  status: job.status,
  totalImages: job.totalImages,
  error: job.error,
  pushError: job.pushError,
  createdAt: (job.completedAt || job.createdAt).toISOString(),
  readAt: job.notificationReadAt?.toISOString() || null,
})

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions)
  const userId = sessionUserId(session)

  if (!userId) {
    return res.status(401).json({ error: "You must be logged in." })
  }

  res.setHeader("Cache-Control", "private, no-store")

  if (req.method === "GET") {
    const [tradeUnreadCount, friendCodeUnreadCount, pokedexImportUnreadCount] =
      await Promise.all([
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
        prisma.pokedexImportJob.count({
          where: {
            ownerId: userId,
            status: { in: POKEDEX_UNREAD_STATUSES },
            notificationReadAt: null,
            notificationDismissedAt: null,
          },
        }),
      ])
    const unreadCount =
      tradeUnreadCount + friendCodeUnreadCount + pokedexImportUnreadCount

    if (req.query.summary === "1") {
      return res.status(200).json({ unreadCount })
    }

    const [tradeNotifications, friendCodeNotifications, pokedexImportJobs] =
      await Promise.all([
        prisma.tradeNotification.findMany({
          where: { ownerId: userId },
          include: tradeNotificationInclude,
          orderBy: { createdAt: "desc" },
          take: NOTIFICATION_LIST_LIMIT,
        }),
        prisma.friendCodeGrabNotification.findMany({
          where: { ownerId: userId },
          include: friendCodeGrabNotificationInclude,
          orderBy: { createdAt: "desc" },
          take: NOTIFICATION_LIST_LIMIT,
        }),
        prisma.pokedexImportJob.findMany({
          where: {
            ownerId: userId,
            status: { in: POKEDEX_NOTIFICATION_STATUSES },
            notificationDismissedAt: null,
          },
          orderBy: { completedAt: "desc" },
          take: NOTIFICATION_LIST_LIMIT,
          select: {
            id: true,
            status: true,
            totalImages: true,
            error: true,
            pushError: true,
            createdAt: true,
            completedAt: true,
            notificationReadAt: true,
          },
        }),
      ])

    const notifications = [
      ...tradeNotifications.map(serializeTradeInboxNotification),
      ...friendCodeNotifications.map(serializeFriendCodeGrabNotification),
      ...pokedexImportJobs.map(serializePokedexImportNotification),
    ]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, NOTIFICATION_LIST_LIMIT)

    return res.status(200).json({
      unreadCount,
      notifications,
      limit: NOTIFICATION_LIST_LIMIT,
    })
  }

  if (req.method === "PUT") {
    const readAt = new Date()
    const [tradeResult, friendCodeResult, pokedexImportResult] = await Promise.all([
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
      prisma.pokedexImportJob.updateMany({
        where: {
          ownerId: userId,
          status: { in: POKEDEX_UNREAD_STATUSES },
          notificationReadAt: null,
          notificationDismissedAt: null,
        },
        data: { notificationReadAt: readAt },
      }),
    ])

    return res.status(200).json({
      updated: tradeResult.count + friendCodeResult.count + pokedexImportResult.count,
      unreadCount: 0,
    })
  }

  if (req.method === "DELETE") {
    const dismissedAt = new Date()
    const [tradeResult, friendCodeResult, pokedexImportResult] = await Promise.all([
      prisma.tradeNotification.deleteMany({
        where: { ownerId: userId },
      }),
      prisma.friendCodeGrabNotification.deleteMany({
        where: { ownerId: userId },
      }),
      prisma.pokedexImportJob.updateMany({
        where: {
          ownerId: userId,
          status: { in: POKEDEX_NOTIFICATION_STATUSES },
          notificationDismissedAt: null,
        },
        data: {
          notificationDismissedAt: dismissedAt,
          notificationReadAt: dismissedAt,
        },
      }),
    ])

    return res.status(200).json({
      cleared: tradeResult.count + friendCodeResult.count + pokedexImportResult.count,
      unreadCount: 0,
    })
  }

  res.setHeader("Allow", ["GET", "PUT", "DELETE"])
  return res.status(405).json({ error: "Method not allowed" })
}
