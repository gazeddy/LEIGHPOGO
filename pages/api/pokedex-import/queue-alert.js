import { getServerSession } from "next-auth/next"
import { authOptions } from "../auth/[...nextauth]"
import prisma from "../../../lib/prisma"
import { getPokedexImportQueueEstimate } from "../../../lib/pokedexImportQueueEstimate"
import { MAX_POKEDEX_IMPORT_QUEUE_WAIT_SECONDS } from "../../../lib/pokedexImportQueue"

function disableCaching(res) {
  res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate")
  res.setHeader("CDN-Cache-Control", "no-store")
  res.setHeader("Pragma", "no-cache")
  res.setHeader("Expires", "0")
}

function sessionUserId(session) {
  const userId = Number(session?.user?.id)
  return Number.isInteger(userId) && userId > 0 ? userId : null
}

function withQueueLimit(queue) {
  return {
    ...queue,
    maxWaitSeconds: MAX_POKEDEX_IMPORT_QUEUE_WAIT_SECONDS,
  }
}

export default async function handler(req, res) {
  disableCaching(res)

  const session = await getServerSession(req, res, authOptions)
  const ownerId = sessionUserId(session)
  if (!ownerId) {
    return res.status(401).json({ error: "You must be signed in." })
  }

  if (req.method === "GET") {
    const [alert, queue, pushSubscriptions] = await Promise.all([
      prisma.pokedexQueueAlert.findUnique({
        where: { ownerId },
        select: { id: true, createdAt: true },
      }),
      getPokedexImportQueueEstimate(),
      prisma.pushSubscription.count({ where: { ownerId } }),
    ])

    return res.status(200).json({
      registered: Boolean(alert),
      createdAt: alert?.createdAt?.toISOString() || null,
      pushEnabled: pushSubscriptions > 0,
      queue: withQueueLimit(queue),
    })
  }

  if (req.method === "DELETE") {
    await prisma.pokedexQueueAlert.deleteMany({ where: { ownerId } })
    return res.status(200).json({ registered: false })
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", ["GET", "POST", "DELETE"])
    return res.status(405).json({ error: "Method not allowed" })
  }

  const [queue, pushSubscriptions] = await Promise.all([
    getPokedexImportQueueEstimate(),
    prisma.pushSubscription.count({ where: { ownerId } }),
  ])

  if (pushSubscriptions <= 0) {
    return res.status(400).json({
      error: "Enable push notifications before requesting a queue alert.",
      pushEnabled: false,
      queue: withQueueLimit(queue),
    })
  }

  if (queue.acceptingUploads) {
    await prisma.pokedexQueueAlert.deleteMany({ where: { ownerId } })
    return res.status(200).json({
      registered: false,
      availableNow: true,
      pushEnabled: true,
      queue: withQueueLimit(queue),
    })
  }

  const alert = await prisma.pokedexQueueAlert.upsert({
    where: { ownerId },
    create: { ownerId },
    update: { createdAt: new Date() },
    select: { createdAt: true },
  })

  return res.status(201).json({
    registered: true,
    createdAt: alert.createdAt.toISOString(),
    availableNow: false,
    pushEnabled: true,
    queue: withQueueLimit(queue),
  })
}
