import { getServerSession } from "next-auth/next"
import { authOptions } from "../../auth/[...nextauth]"
import prisma from "../../../../lib/prisma"
import {
  decodePokedexImportImages,
  MAX_POKEDEX_IMPORT_QUEUE_WAIT_SECONDS,
  storePokedexImportImages,
} from "../../../../lib/pokedexImportQueue"
import {
  getPokedexImportQueueEstimate,
  getPokedexImportQueuePosition,
  pokedexImportQueueRetryAfterSeconds,
} from "../../../../lib/pokedexImportQueueEstimate"

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "64mb",
    },
  },
}

const sessionUserId = (session) => {
  const userId = Number(session?.user?.id)
  return Number.isInteger(userId) && userId > 0 ? userId : null
}

function disableCaching(res) {
  res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate")
  res.setHeader("CDN-Cache-Control", "no-store")
  res.setHeader("Pragma", "no-cache")
  res.setHeader("Expires", "0")
}

function queueBusyResponse(res, estimate) {
  const retryAfterSeconds = pokedexImportQueueRetryAfterSeconds(estimate)
  res.setHeader("Retry-After", String(retryAfterSeconds))
  return res.status(429).json({
    error: `The Pokédex import queue is busy. Estimated wait is about ${estimate.estimatedWaitSeconds} seconds, so new uploads are paused until it is likely to be 2 minutes or less.`,
    queue: {
      ...estimate,
      maxWaitSeconds: MAX_POKEDEX_IMPORT_QUEUE_WAIT_SECONDS,
      retryAfterSeconds,
    },
  })
}

function serializeJob(job) {
  return {
    ...job,
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt?.toISOString() || null,
    completedAt: job.completedAt?.toISOString() || null,
    notificationReadAt: job.notificationReadAt?.toISOString() || null,
    pushSentAt: job.pushSentAt?.toISOString() || null,
  }
}

export default async function handler(req, res) {
  disableCaching(res)

  const session = await getServerSession(req, res, authOptions)
  const ownerId = sessionUserId(session)
  if (!ownerId) {
    return res.status(401).json({ error: "You must be signed in to import your Pokédex." })
  }

  if (req.method === "GET") {
    const [jobs, queue] = await Promise.all([
      prisma.pokedexImportJob.findMany({
        where: { ownerId },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          status: true,
          totalImages: true,
          processedImages: true,
          createdAt: true,
          startedAt: true,
          completedAt: true,
          error: true,
          notificationReadAt: true,
          pushSentAt: true,
          pushError: true,
        },
      }),
      getPokedexImportQueueEstimate(),
    ])

    return res.status(200).json({
      jobs: jobs.map(serializeJob),
      queue: {
        ...queue,
        maxWaitSeconds: MAX_POKEDEX_IMPORT_QUEUE_WAIT_SECONDS,
      },
    })
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", ["GET", "POST"])
    return res.status(405).json({ error: "Method not allowed" })
  }

  const queueBeforeUpload = await getPokedexImportQueueEstimate()
  if (!queueBeforeUpload.acceptingUploads) {
    return queueBusyResponse(res, queueBeforeUpload)
  }

  let images
  try {
    images = decodePokedexImportImages(req.body?.images)
  } catch (error) {
    return res.status(400).json({ error: error.message })
  }

  const queueBeforeCreate = await getPokedexImportQueueEstimate()
  if (!queueBeforeCreate.acceptingUploads) {
    return queueBusyResponse(res, queueBeforeCreate)
  }

  const job = await prisma.pokedexImportJob.create({
    data: {
      ownerId,
      status: "UPLOADING",
      totalImages: images.length,
    },
    select: {
      id: true,
      status: true,
      totalImages: true,
      processedImages: true,
      createdAt: true,
    },
  })

  try {
    await storePokedexImportImages(job.id, images)
  } catch (error) {
    console.error("Unable to store queued Pokédex screenshots", error)
    await prisma.pokedexImportJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        error: "The server could not store the uploaded screenshots.",
        completedAt: new Date(),
        notificationReadAt: null,
      },
    })
    return res.status(500).json({
      error: "The server could not store the uploaded screenshots.",
    })
  }

  const queuedJob = await prisma.pokedexImportJob.update({
    where: { id: job.id },
    data: { status: "QUEUED" },
    select: {
      id: true,
      status: true,
      totalImages: true,
      processedImages: true,
      createdAt: true,
    },
  })

  const [position, estimatedWait, pushSubscriptions] = await Promise.all([
    getPokedexImportQueuePosition(queuedJob),
    getPokedexImportQueueEstimate({ beforeJobId: queuedJob.id }),
    prisma.pushSubscription.count({ where: { ownerId } }),
  ])

  return res.status(202).json({
    job: {
      id: queuedJob.id,
      status: queuedJob.status,
      totalImages: queuedJob.totalImages,
      processedImages: queuedJob.processedImages,
      createdAt: queuedJob.createdAt.toISOString(),
      queuePosition: position,
      estimatedWaitSeconds: estimatedWait.estimatedWaitSeconds,
    },
    queue: {
      ...queueBeforeCreate,
      maxWaitSeconds: MAX_POKEDEX_IMPORT_QUEUE_WAIT_SECONDS,
    },
    pushEnabled: pushSubscriptions > 0,
  })
}
