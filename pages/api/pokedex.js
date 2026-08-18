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

export async function replacePokedexEntries(ownerId, dexNumbers) {
  return prisma.$transaction(async (tx) => {
    const previousEntries = await tx.pokedexEntry.findMany({
      where: { ownerId },
      select: { dexNumber: true },
    })
    const previouslyCaught = new Set(
      previousEntries.map((entry) => Number(entry.dexNumber))
    )
    const newlyCaughtDexNumbers = dexNumbers.filter(
      (dexNumber) => !previouslyCaught.has(dexNumber)
    )

    let removedWantedCount = 0
    for (const chunk of chunkDexNumbers(newlyCaughtDexNumbers)) {
      const removed = await tx.wantedTrade.deleteMany({
        where: {
          ownerId,
          dexNumber: { in: chunk },
          shiny: false,
          lucky: false,
          xxl: false,
          xxs: false,
          costume: false,
          background: false,
          dynamax: false,
          gigantamax: false,
        },
      })
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
      removedWantedCount,
    }
  })
}

export default async function handler(req, res) {
  disableCaching(res)

  const session = await ensureSession(req, res, authOptions)
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

    try {
      const cleanup = await replacePokedexEntries(ownerId, dexNumbers)
      res.status(200).json({ dexNumbers, ...cleanup })
    } catch (error) {
      console.error("Failed to save Pokédex entries", error)
      res.status(500).json({ error: "Unable to save your Pokédex right now." })
    }
    return
  }

  res.setHeader("Allow", ["GET", "PUT"])
  res.status(405).end("Method Not Allowed")
}
