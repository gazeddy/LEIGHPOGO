import { getServerSession } from "next-auth/next"
import { authOptions } from "../../auth/[...nextauth]"
import prisma from "../../../../lib/prisma"
import {
  decodePokedexImportImages,
  MAX_ACTIVE_POKEDEX_IMPORT_JOBS,
  storePokedexImportImages,
} from "../../../../lib/pokedexImportQueue"

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

async function queuePosition(job) {
  if (job.status !== "QUEUED") return null

  const [processingCount, queuedAhead] = await Promise.all([
    prisma.pokedexImportJob.count({ where: { status: "PROCESSING" } }),
    prisma.pokedexImportJob.count({
      where: {
        status: "QUEUED",
        id: { lt: job.id },
      },
    }),
  ])

  return processingCount + queuedAhead + 1
}

export default async function handler(req, res) {
  disableCaching(res)

  const session = await getServerSession(req, res, authOptions)
  const ownerId = sessionUserId(session)
  if (!ownerId) {
    return res.status(401).json({ error: "You must be signed in to import your Pokédex." })
  }

  if (req.method === "GET") {
    const jobs = await prisma.pokedexImportJob.findMany({
      where: { ownerId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        status: true,
        totalImages: true,
        processedImages: true,
        createdAt: true,
        startedAt: true,
        completedAt: true,
        error: true,
      },
    })

    return res.status(200).json({
      jobs: jobs.map((job) => ({
        ...job,
        createdAt: job.createdAt.toISOString(),
        startedAt: job.startedAt?.toISOString() || null,
        completedAt: job.completedAt?.toISOString() || null,
      })),
    })
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", ["GET", "POST"])
    return res.status(405).json({ error: "Method not allowed" })
  }

  const activeJobs = await prisma.pokedexImportJob.count({
    where: {
      ownerId,
      status: { in: ["UPLOADING", "QUEUED", "PROCESSING"] },
    },
  })

  if (activeJobs >= MAX_ACTIVE_POKEDEX_IMPORT_JOBS) {
    return res.status(429).json({
      error: `You already have ${MAX_ACTIVE_POKEDEX_IMPORT_JOBS} Pokédex imports uploading, queued or processing. Wait for one to finish before adding another.`,
    })
  }

  let images
  try {
    images = decodePokedexImportImages(req.body?.images)
  } catch (error) {
    return res.status(400).json({ error: error.message })
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

  const [position, pushSubscriptions] = await Promise.all([
    queuePosition(queuedJob),
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
    },
    pushEnabled: pushSubscriptions > 0,
  })
}
