import { getServerSession } from "next-auth/next"
import { authOptions } from "./auth/[...nextauth]"
import prisma from "../../lib/prisma"

const POKEDEX_WRITE_CHUNK_SIZE = 250
const MAX_REASONABLE_DEX_NUMBER = 5000

function disableCaching(res) {
  res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate")
  res.setHeader("CDN-Cache-Control", "no-store")
  res.setHeader("Pragma", "no-cache")
  res.setHeader("Expires", "0")
}

async function ensureSession(req, res) {
  const session = await getServerSession(req, res, authOptions)
  if (!session?.user?.id) {
    res.status(401).json({ error: "You must be signed in to manage your Pokédex." })
    return null
  }
  return session
}

function normaliseDexNumbers(values) {
  if (!Array.isArray(values)) return null

  return Array.from(
    new Set(
      values
        .map(Number)
        .filter(
          (dexNumber) =>
            Number.isInteger(dexNumber) &&
            dexNumber > 0 &&
            dexNumber <= MAX_REASONABLE_DEX_NUMBER
        )
    )
  ).sort((left, right) => left - right)
}

function chunkDexNumbers(dexNumbers, chunkSize = POKEDEX_WRITE_CHUNK_SIZE) {
  const chunks = []
  for (let index = 0; index < dexNumbers.length; index += chunkSize) {
    chunks.push(dexNumbers.slice(index, index + chunkSize))
  }
  return chunks
}

const wantedTradeRollbackSelect = {
  dexNumber: true,
  pokemonName: true,
  shiny: true,
  lucky: true,
  xxl: true,
  xxs: true,
  costume: true,
  background: true,
  dynamax: true,
  gigantamax: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
}

const baseWantedTradeWhere = (ownerId, dexNumbers) => ({
  ownerId,
  dexNumber: { in: dexNumbers },
  shiny: false,
  lucky: false,
  xxl: false,
  xxs: false,
  costume: false,
  background: false,
  dynamax: false,
  gigantamax: false,
})

async function replacePokedexEntriesWithClient(tx, ownerId, dexNumbers) {
  const previousEntries = await tx.pokedexEntry.findMany({
    where: { ownerId },
    select: { dexNumber: true },
  })
  const previouslyCaught = new Set(
    previousEntries.map((entry) => Number(entry.dexNumber))
  )
  const targetCaught = new Set(dexNumbers)
  const newlyCaughtDexNumbers = dexNumbers.filter(
    (dexNumber) => !previouslyCaught.has(dexNumber)
  )
  const removedDexNumbers = previousEntries
    .map((entry) => Number(entry.dexNumber))
    .filter((dexNumber) => !targetCaught.has(dexNumber))
    .sort((left, right) => left - right)

  const removedWantedTrades = []
  let removedWantedCount = 0
  for (const chunk of chunkDexNumbers(newlyCaughtDexNumbers)) {
    const where = baseWantedTradeWhere(ownerId, chunk)
    const existingWanted = await tx.wantedTrade.findMany({
      where,
      select: wantedTradeRollbackSelect,
    })
    removedWantedTrades.push(...existingWanted)

    const removed = await tx.wantedTrade.deleteMany({ where })
    removedWantedCount += removed.count
  }

  await tx.pokedexEntry.deleteMany({ where: { ownerId } })

  for (const chunk of chunkDexNumbers(dexNumbers)) {
    await tx.pokedexEntry.createMany({
      data: chunk.map((dexNumber) => ({ ownerId, dexNumber })),
    })
  }

  return {
    newlyCaughtDexNumbers,
    removedDexNumbers,
    removedWantedTrades,
    removedWantedCount,
  }
}

export async function replacePokedexEntries(ownerId, dexNumbers) {
  return prisma.$transaction(async (tx) => {
    const result = await replacePokedexEntriesWithClient(tx, ownerId, dexNumbers)
    return {
      newlyCaughtDexNumbers: result.newlyCaughtDexNumbers,
      removedWantedCount: result.removedWantedCount,
    }
  })
}

function parseImportResult(resultJson) {
  if (!resultJson) return {}
  const parsed = JSON.parse(resultJson)
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
  return parsed
}

function importJobIdFromRequest(req) {
  if (req.body?.importJobId != null) {
    return Number(req.body.importJobId)
  }

  try {
    const referer = String(req.headers?.referer || "")
    if (!referer) return null
    const url = new URL(referer)
    if (url.pathname !== "/pokedex-import") return null
    const jobId = Number(url.searchParams.get("job"))
    return Number.isInteger(jobId) && jobId > 0 ? jobId : null
  } catch {
    return null
  }
}

async function applyPokedexImport(ownerId, importJobId, dexNumbers) {
  return prisma.$transaction(async (tx) => {
    const job = await tx.pokedexImportJob.findFirst({
      where: {
        id: importJobId,
        ownerId,
        status: "COMPLETE",
      },
      select: {
        id: true,
        resultJson: true,
      },
    })

    if (!job) {
      const error = new Error("This Pokédex import is no longer available to apply.")
      error.statusCode = 409
      throw error
    }

    let result
    try {
      result = parseImportResult(job.resultJson)
    } catch {
      const error = new Error("The Pokédex import result could not be read.")
      error.statusCode = 409
      throw error
    }

    if (result.rollback) {
      const error = new Error(
        "This Pokédex import was already applied. Finish its screenshot cleanup instead of applying it again.",
      )
      error.statusCode = 409
      throw error
    }

    const replacement = await replacePokedexEntriesWithClient(tx, ownerId, dexNumbers)
    const rollback = {
      version: 1,
      addedDexNumbers: replacement.newlyCaughtDexNumbers,
      removedDexNumbers: replacement.removedDexNumbers,
      removedWantedTrades: replacement.removedWantedTrades,
    }

    await tx.pokedexImportJob.update({
      where: { id: job.id },
      data: {
        resultJson: JSON.stringify({ ...result, rollback }),
      },
    })

    return {
      newlyCaughtDexNumbers: replacement.newlyCaughtDexNumbers,
      removedWantedCount: replacement.removedWantedCount,
    }
  })
}

export default async function handler(req, res) {
  disableCaching(res)

  const session = await ensureSession(req, res)
  if (!session) return

  const ownerId = Number(session.user.id)
  if (!Number.isInteger(ownerId) || ownerId <= 0) {
    res.status(401).json({ error: "Your session is invalid. Please sign in again." })
    return
  }

  if (req.method === "GET") {
    try {
      const entries = await prisma.pokedexEntry.findMany({
        where: { ownerId },
        select: { dexNumber: true },
        orderBy: { dexNumber: "asc" },
      })

      res.status(200).json({
        dexNumbers: entries.map((entry) => entry.dexNumber),
      })
    } catch (error) {
      console.error("Failed to fetch Pokédex entries", error)
      res.status(500).json({ error: "Unable to load your Pokédex right now." })
    }
    return
  }

  if (req.method === "PUT") {
    const dexNumbers = normaliseDexNumbers(req.body?.dexNumbers)

    if (dexNumbers === null) {
      res.status(400).json({ error: "dexNumbers must be an array." })
      return
    }

    const importJobId = importJobIdFromRequest(req)
    if (
      req.body?.importJobId != null &&
      (!Number.isInteger(importJobId) || importJobId <= 0)
    ) {
      res.status(400).json({ error: "importJobId must be a positive integer." })
      return
    }

    try {
      const cleanup = importJobId
        ? await applyPokedexImport(ownerId, importJobId, dexNumbers)
        : await replacePokedexEntries(ownerId, dexNumbers)
      res.status(200).json({ dexNumbers, ...cleanup })
    } catch (error) {
      console.error("Failed to save Pokédex entries", error)
      res.status(error?.statusCode || 500).json({
        error: error?.statusCode
          ? error.message
          : "Unable to save your Pokédex right now.",
      })
    }
    return
  }

  res.setHeader("Allow", ["GET", "PUT"])
  res.status(405).end("Method Not Allowed")
}
