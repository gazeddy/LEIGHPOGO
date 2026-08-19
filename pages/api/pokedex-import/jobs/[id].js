import { getServerSession } from "next-auth/next"
import { authOptions } from "../../auth/[...nextauth]"
import prisma from "../../../../lib/prisma"

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

  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"])
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

  const job = await prisma.pokedexImportJob.findFirst({
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

  if (!job) {
    return res.status(404).json({ error: "Pokédex import job not found." })
  }

  let result = null
  if (job.status === "COMPLETE" && job.resultJson) {
    try {
      result = JSON.parse(job.resultJson)
    } catch (error) {
      console.error("Unable to parse Pokédex import result", error)
      return res.status(500).json({ error: "The completed OCR result could not be read." })
    }
  }

  return res.status(200).json({
    job: {
      id: job.id,
      status: job.status,
      totalImages: job.totalImages,
      processedImages: job.processedImages,
      queuePosition: await queuePosition(job),
      error: job.error,
      createdAt: job.createdAt.toISOString(),
      startedAt: job.startedAt?.toISOString() || null,
      completedAt: job.completedAt?.toISOString() || null,
      result,
    },
  })
}
