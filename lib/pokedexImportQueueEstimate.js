import prisma from "./prisma"
import {
  calculatePokedexImportQueueEstimate,
  MAX_POKEDEX_IMPORT_QUEUE_WAIT_SECONDS,
} from "./pokedexImportQueue"

const ACTIVE_STATUSES = ["UPLOADING", "QUEUED", "PROCESSING"]
const HISTORY_STATUSES = ["COMPLETE", "ACCEPTED"]
const HISTORY_SAMPLE_SIZE = 20

export async function getPokedexImportQueueEstimate({ beforeJobId = null } = {}) {
  const activeWhere = {
    status: { in: ACTIVE_STATUSES },
  }

  if (Number.isInteger(Number(beforeJobId)) && Number(beforeJobId) > 0) {
    activeWhere.id = { lt: Number(beforeJobId) }
  }

  const [activeJobs, history] = await Promise.all([
    prisma.pokedexImportJob.findMany({
      where: activeWhere,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        status: true,
        totalImages: true,
        processedImages: true,
        createdAt: true,
      },
    }),
    prisma.pokedexImportJob.findMany({
      where: {
        status: { in: HISTORY_STATUSES },
        startedAt: { not: null },
        completedAt: { not: null },
      },
      orderBy: { completedAt: "desc" },
      take: HISTORY_SAMPLE_SIZE,
      select: {
        totalImages: true,
        startedAt: true,
        completedAt: true,
      },
    }),
  ])

  return calculatePokedexImportQueueEstimate(activeJobs, history)
}

export async function getPokedexImportQueuePosition(job) {
  if (!job || job.status !== "QUEUED") return null

  const ahead = await prisma.pokedexImportJob.count({
    where: {
      status: { in: ACTIVE_STATUSES },
      id: { lt: Number(job.id) },
    },
  })

  return ahead + 1
}

export function pokedexImportQueueRetryAfterSeconds(estimate) {
  const excess = Math.max(
    0,
    Number(estimate?.estimatedWaitSeconds || 0) -
      MAX_POKEDEX_IMPORT_QUEUE_WAIT_SECONDS,
  )
  const processingStep = Math.max(5, Math.ceil(Number(estimate?.secondsPerImage || 0)))
  return Math.max(10, Math.min(60, Math.ceil(excess + processingStep)))
}
