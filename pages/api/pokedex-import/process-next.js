import crypto from "crypto"
import prisma from "../../../lib/prisma"
import {
  processStoredPokedexImport,
  removeStoredPokedexImport,
} from "../../../lib/pokedexImportQueue"
import { sendPushToUser } from "../../../lib/pushServer"

const STALE_JOB_MS = 30 * 60 * 1000

function disableCaching(res) {
  res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate")
  res.setHeader("CDN-Cache-Control", "no-store")
  res.setHeader("Pragma", "no-cache")
  res.setHeader("Expires", "0")
}

function secretMatches(provided, expected) {
  if (!provided || !expected) return false
  const providedBuffer = Buffer.from(String(provided))
  const expectedBuffer = Buffer.from(String(expected))
  if (providedBuffer.length !== expectedBuffer.length) return false
  return crypto.timingSafeEqual(providedBuffer, expectedBuffer)
}

async function recoverStaleJobs() {
  const staleBefore = new Date(Date.now() - STALE_JOB_MS)
  await prisma.pokedexImportJob.updateMany({
    where: {
      status: "PROCESSING",
      startedAt: { lt: staleBefore },
    },
    data: {
      status: "QUEUED",
      startedAt: null,
      processedImages: 0,
      error: null,
    },
  })
}

async function claimNextJob() {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const candidate = await prisma.pokedexImportJob.findFirst({
      where: { status: "QUEUED" },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        ownerId: true,
        totalImages: true,
      },
    })

    if (!candidate) return null

    const claimed = await prisma.pokedexImportJob.updateMany({
      where: {
        id: candidate.id,
        status: "QUEUED",
      },
      data: {
        status: "PROCESSING",
        startedAt: new Date(),
        processedImages: 0,
        error: null,
      },
    })

    if (claimed.count === 1) return candidate
  }

  return null
}

async function sendCompletionPush(job, success) {
  try {
    if (success) {
      return await sendPushToUser(job.ownerId, {
        title: "Pokédex screenshots ready",
        body: `${job.totalImages} screenshot${job.totalImages === 1 ? " has" : "s have"} been processed. Tap to review your missing Pokémon.`,
        url: `/pokedex-import?job=${job.id}`,
        tag: `pokedex-import-${job.id}`,
      })
    }

    return await sendPushToUser(job.ownerId, {
      title: "Pokédex import needs attention",
      body: "The screenshot import could not be processed. Tap to view the error and try again.",
      url: `/pokedex-import?job=${job.id}`,
      tag: `pokedex-import-${job.id}`,
    })
  } catch (error) {
    console.error("Unable to send Pokédex import push notification", error)
    return null
  }
}

export default async function handler(req, res) {
  disableCaching(res)

  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"])
    return res.status(405).json({ error: "Method not allowed" })
  }

  const expectedSecret = process.env.POKEDEX_IMPORT_WORKER_SECRET
  const providedSecret = req.headers["x-pokedex-import-worker-secret"]
  if (!secretMatches(providedSecret, expectedSecret)) {
    return res.status(401).json({ error: "Invalid Pokédex import worker secret." })
  }

  await recoverStaleJobs()
  const job = await claimNextJob()

  if (!job) {
    return res.status(204).end()
  }

  try {
    const result = await processStoredPokedexImport(
      job.id,
      async (processedImages) => {
        await prisma.pokedexImportJob.update({
          where: { id: job.id },
          data: { processedImages },
        })
      },
    )

    await prisma.pokedexImportJob.update({
      where: { id: job.id },
      data: {
        status: "COMPLETE",
        processedImages: job.totalImages,
        resultJson: JSON.stringify(result),
        error: null,
        completedAt: new Date(),
      },
    })

    await removeStoredPokedexImport(job.id)
    const push = await sendCompletionPush(job, true)

    return res.status(200).json({
      processed: true,
      jobId: job.id,
      status: "COMPLETE",
      push,
    })
  } catch (error) {
    console.error(`Pokédex import job ${job.id} failed`, error?.cause || error)

    const message = String(error?.message || "Unable to process the queued screenshots.").slice(
      0,
      500,
    )

    await prisma.pokedexImportJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        error: message,
        completedAt: new Date(),
      },
    })

    await removeStoredPokedexImport(job.id).catch(() => {})
    const push = await sendCompletionPush(job, false)

    return res.status(200).json({
      processed: true,
      jobId: job.id,
      status: "FAILED",
      error: message,
      push,
    })
  }
}
