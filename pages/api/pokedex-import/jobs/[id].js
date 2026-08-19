import { getServerSession } from "next-auth/next"
import { authOptions } from "../../auth/[...nextauth]"
import prisma from "../../../../lib/prisma"
import { removeStoredPokedexImport } from "../../../../lib/pokedexImportQueue"
import {
  getPokedexImportQueueEstimate,
  getPokedexImportQueuePosition,
} from "../../../../lib/pokedexImportQueueEstimate"

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

async function loadOwnedJob(id, ownerId) {
  return prisma.pokedexImportJob.findFirst({
    where: { id, ownerId },
    select: {
      id: true,
      status: true,
      totalImages: true,
      processedImages: true,
      resultJson: true,
      error: true,
      createdAt: true,
      startedAt: true,
      completedAt: true,
    },
  })
}

function parseCompletedResult(job) {
  if (!["COMPLETE", "ACCEPTED"].includes(job.status) || !job.resultJson) {
    return null
  }

  return JSON.parse(job.resultJson)
}

export default async function handler(req, res) {
  disableCaching(res)

  if (!["GET", "POST"].includes(req.method)) {
    res.setHeader("Allow", ["GET", "POST"])
    return res.status(405).json({ error: "Method not allowed" })
  }

  const session = await getServerSession(req, res, authOptions)
  const ownerId = sessionUserId(session)
  if (!ownerId) {
    return res.status(401).json({ error: "You must be signed in to view this Pokédex import." })
  }

  const id = Number(Array.isArray(req.query.id) ? req.query.id[0] : req.query.id)
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid Pokédex import job." })
  }

  const job = await loadOwnedJob(id, ownerId)
  if (!job) {
    return res.status(404).json({ error: "Pokédex import job not found." })
  }

  if (req.method === "POST") {
    const action = String(req.body?.action || "").trim().toUpperCase()
    if (action !== "ACCEPT") {
      return res.status(400).json({ error: "Unsupported Pokédex import action." })
    }

    if (job.status === "ACCEPTED") {
      try {
        await removeStoredPokedexImport(job.id)
      } catch (error) {
        console.error(`Unable to re-run screenshot cleanup for import ${job.id}`, error)
        return res.status(500).json({
          error: "The stored screenshots could not be deleted yet. Try again to finish cleanup.",
        })
      }
      return res.status(200).json({ accepted: true, screenshotsDeleted: true })
    }

    if (job.status !== "COMPLETE") {
      return res.status(409).json({
        error: "This Pokédex import can only be accepted after OCR processing is complete.",
      })
    }

    try {
      await removeStoredPokedexImport(job.id)
      await prisma.pokedexImportJob.update({
        where: { id: job.id },
        data: { status: "ACCEPTED" },
      })
    } catch (error) {
      console.error(`Unable to delete accepted Pokédex screenshots for job ${job.id}`, error)
      return res.status(500).json({
        error: "The stored screenshots could not be deleted yet. Try again to finish cleanup.",
      })
    }

    return res.status(200).json({ accepted: true, screenshotsDeleted: true })
  }

  let result = null
  try {
    result = parseCompletedResult(job)
  } catch (error) {
    console.error("Unable to parse Pokédex import result", error)
    return res.status(500).json({ error: "The completed OCR result could not be read." })
  }

  const [position, estimatedWait] = await Promise.all([
    getPokedexImportQueuePosition(job),
    job.status === "QUEUED"
      ? getPokedexImportQueueEstimate({ beforeJobId: job.id })
      : Promise.resolve(null),
  ])

  return res.status(200).json({
    job: {
      id: job.id,
      status: job.status,
      totalImages: job.totalImages,
      processedImages: job.processedImages,
      queuePosition: position,
      estimatedWaitSeconds: estimatedWait?.estimatedWaitSeconds ?? null,
      error: job.error,
      createdAt: job.createdAt.toISOString(),
      startedAt: job.startedAt?.toISOString() || null,
      completedAt: job.completedAt?.toISOString() || null,
      result,
    },
  })
}
