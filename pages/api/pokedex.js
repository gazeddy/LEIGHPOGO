import { getServerSession } from "next-auth/next"
import { authOptions } from "./auth/[...nextauth]"
import prisma from "../../lib/prisma"

const {
  filterReleasedDexNumbers,
  getReleasedPokemonData,
} = require("../../lib/releasedPokemonCache")
const {
  applyPokemonAvailabilityOverrides,
} = require("../../lib/pokemonAvailability")
const {
  readPokemonAvailabilityOverrides,
} = require("../../lib/pokemonAvailabilityStore")

const POKEDEX_WRITE_CHUNK_SIZE = 250

function disableCaching(res) {
  res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate")
  res.setHeader("CDN-Cache-Control", "no-store")
  res.setHeader("Pragma", "no-cache")
  res.setHeader("Expires", "0")
}

async function ensureSession(req, res) {
  const session = await getServerSession(req, res, authOptions)
  if (!session) {
    res.status(401).json({ error: "You must be signed in to manage your Pokédex." })
    return null
  }
  return session
}

async function loadEffectiveReleasedPokemon(res) {
  let releasedPokemonData

  try {
    releasedPokemonData = await getReleasedPokemonData()
  } catch (error) {
    console.error("Failed to load released Pokémon data", error)
    res.status(503).json({ error: "The released Pokémon list is temporarily unavailable." })
    return null
  }

  try {
    const overrideResult = await readPokemonAvailabilityOverrides()
    return {
      ...releasedPokemonData,
      dexNumbers: applyPokemonAvailabilityOverrides(
        releasedPokemonData.dexNumbers,
        overrideResult.overrides
      ),
    }
  } catch (error) {
    console.error(
      "Failed to apply Pokémon availability overrides while saving Pokédex progress; using POGOAPI release status",
      error
    )
    return releasedPokemonData
  }
}

function chunkDexNumbers(dexNumbers, chunkSize = POKEDEX_WRITE_CHUNK_SIZE) {
  const chunks = []
  for (let index = 0; index < dexNumbers.length; index += chunkSize) {
    chunks.push(dexNumbers.slice(index, index + chunkSize))
  }
  return chunks
}

export async function replacePokedexEntries(ownerId, dexNumbers) {
  await prisma.$transaction(async (tx) => {
    await tx.pokedexEntry.deleteMany({ where: { ownerId } })

    for (const chunk of chunkDexNumbers(dexNumbers)) {
      await tx.pokedexEntry.createMany({
        data: chunk.map((dexNumber) => ({ ownerId, dexNumber })),
      })
    }
  })
}

export default async function handler(req, res) {
  disableCaching(res)

  const session = await ensureSession(req, res)
  if (!session) return

  const releasedPokemonData = await loadEffectiveReleasedPokemon(res)
  if (!releasedPokemonData) return

  if (req.method === "GET") {
    try {
      const entries = await prisma.pokedexEntry.findMany({
        where: { ownerId: session.user.id },
        select: { dexNumber: true },
      })

      res.status(200).json({
        dexNumbers: filterReleasedDexNumbers(
          entries.map((entry) => entry.dexNumber),
          releasedPokemonData.dexNumbers
        ),
      })
    } catch (error) {
      console.error("Failed to fetch Pokédex entries", error)
      res.status(500).json({ error: "Unable to load your Pokédex right now." })
    }
    return
  }

  if (req.method === "PUT") {
    const { dexNumbers } = req.body || {}

    if (!Array.isArray(dexNumbers)) {
      res.status(400).json({ error: "dexNumbers must be an array." })
      return
    }

    const releasedDexNumbers = filterReleasedDexNumbers(
      dexNumbers,
      releasedPokemonData.dexNumbers
    )

    try {
      await replacePokedexEntries(session.user.id, releasedDexNumbers)
      res.status(200).json({ dexNumbers: releasedDexNumbers })
    } catch (error) {
      console.error("Failed to save Pokédex entries", error)
      res.status(500).json({ error: "Unable to save your Pokédex right now." })
    }
    return
  }

  res.setHeader("Allow", ["GET", "PUT"])
  res.status(405).end("Method Not Allowed")
}
