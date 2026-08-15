import { getServerSession } from "next-auth/next"
import { authOptions } from "../auth/[...nextauth]"
import prisma from "../../../lib/prisma"

const sessionUserId = (session) => {
  const userId = Number(session?.user?.id)
  return Number.isInteger(userId) ? userId : null
}

const normalizeSubscription = (value) => {
  const endpoint = String(value?.endpoint || "").trim()
  const p256dh = String(value?.keys?.p256dh || "").trim()
  const auth = String(value?.keys?.auth || "").trim()

  if (!endpoint || !p256dh || !auth) return null

  return { endpoint, p256dh, auth }
}

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions)
  const userId = sessionUserId(session)

  if (!userId) {
    return res.status(401).json({ error: "You must be logged in." })
  }

  res.setHeader("Cache-Control", "private, no-store")

  if (req.method === "GET") {
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { ownerId: userId },
      select: {
        endpoint: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
    })

    return res.status(200).json({
      subscriptions: subscriptions.map((subscription) => ({
        endpoint: subscription.endpoint,
        createdAt: subscription.createdAt.toISOString(),
        updatedAt: subscription.updatedAt.toISOString(),
      })),
    })
  }

  if (req.method === "POST") {
    const subscription = normalizeSubscription(req.body?.subscription)

    if (!subscription) {
      return res.status(400).json({ error: "Invalid push subscription." })
    }

    const saved = await prisma.pushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      create: {
        ownerId: userId,
        ...subscription,
        userAgent: req.headers["user-agent"] || null,
      },
      update: {
        ownerId: userId,
        p256dh: subscription.p256dh,
        auth: subscription.auth,
        userAgent: req.headers["user-agent"] || null,
      },
      select: {
        endpoint: true,
        updatedAt: true,
      },
    })

    return res.status(200).json({
      subscribed: true,
      endpoint: saved.endpoint,
      updatedAt: saved.updatedAt.toISOString(),
    })
  }

  if (req.method === "DELETE") {
    const endpoint = String(req.body?.endpoint || "").trim()

    if (!endpoint) {
      return res.status(400).json({ error: "Push endpoint is required." })
    }

    const result = await prisma.pushSubscription.deleteMany({
      where: {
        ownerId: userId,
        endpoint,
      },
    })

    return res.status(200).json({
      subscribed: false,
      deleted: result.count,
    })
  }

  res.setHeader("Allow", ["GET", "POST", "DELETE"])
  return res.status(405).json({ error: "Method not allowed" })
}
