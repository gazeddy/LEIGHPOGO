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
      pushSentAt: null,
      pushError: null,
    },
  })

  const staleUploads = await prisma.pokedexImportJob.findMany({
    where: {
      status: "UPLOADING",
      createdAt: { lt: staleBefore },
    },
    select: { id: true },
  })

  if (staleUploads.length > 0) {
    await prisma.pokedexImportJob.updateMany({
      where: { id: { in: staleUploads.map((job) => job.id) } },
      data: {
        status: "FAILED",
        error: "The screenshot upload did not finish. Please queue the import again.",
        completedAt: new Date(),
        notificationReadAt: null,
        pushSentAt: null,
        pushError: "The upload expired before OCR processing could start.",
      },
    })

    await Promise.all(
      staleUploads.map((job) => removeStoredPokedexImport(job.id).catch(() => {})),
    )
  }
}

async function claimNextJob() {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const candidate = await prisma.pokedexImportJob.findFirst({
      where: { status: { in: ["UPLOADING", "QUEUED"] } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        ownerId: true,
        status: true,
        totalImages: true,
      },
    })

    if (!candidate) return null

    // Strict first-come-first-served ordering: do not jump an earlier upload
    // that is still being written to disk. The next timer run will try again.
    if (candidate.status === "UPLOADING") return null

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
        pushSentAt: null,
        pushError: null,
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
    return {
      configured: null,
      subscriptions: null,
      sent: 0,
      failed: 1,
      removed: 0,
      error: String(error?.message || error || "Unknown push error"),
    }
  }
}

function pushFailureMessage(push) {
  if (!push) return "Push delivery returned no result."
  if (push.error) return `Push delivery failed: ${push.error}`
  if (push.configured === false) return "Web Push is not configured on this server."
  if (Number(push.subscriptions) === 0) return "No push subscription is registered for this account."
  if (Number(push.sent) === 0) {
    return `The push service did not accept the notification${Number(push.failed) > 0 ? ` (${push.failed} failed)` : ""}.`
  }
  return null
}

async function recordPushResult(jobId, push) {
  const pushError = pushFailureMessage(push)
  await prisma.pokedexImportJob.update({
    where: { id: jobId },
    data: {
      pushSentAt: pushError ? null : new Date(),
      pushError,
    },
  })
  return pushError
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
        notificationReadAt: null,
        pushSentAt: null,
        pushError: null,
      },
    })

    // The completed job itself is also the persistent in-app notification.
    // Keep the screenshots until the user reviews and accepts the OCR result.
    const push = await sendCompletionPush(job, true)
    const pushError = await recordPushResult(job.id, push)

    return res.status(200).json({
      processed: true,
      jobId: job.id,
      status: "COMPLETE",
      screenshotsRetainedForReview: true,
      push,
      pushError,
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
        notificationReadAt: null,
        pushSentAt: null,
        pushError: null,
      },
    })

    await removeStoredPokedexImport(job.id).catch(() => {})
    const push = await sendCompletionPush(job, false)
    const pushError = await recordPushResult(job.id, push)

    return res.status(200).json({
      processed: true,
      jobId: job.id,
      status: "FAILED",
      error: message,
      push,
      pushError,
    })
  }
}
