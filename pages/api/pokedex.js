import { getServerSession } from "next-auth/next"
import { authOptions } from "./auth/[...nextauth]"
import prisma from "../../lib/prisma"

const {
  filterReleasedDexNumbers,
  getReleasedPokemonData,
} = require("../../lib/releasedPokemonCache")

async function ensureSession(req, res) {
  const session = await getServerSession(req, res, authOptions)
  if (!session) {
    res.status(401).json({ error: "You must be signed in to manage your Pokédex." })
    return null
  }
  return session
}

async function loadReleasedPokemon(res) {
  try {
    return await getReleasedPokemonData()
  } catch (error) {
    console.error("Failed to load released Pokémon data", error)
    res.status(503).json({ error: "The released Pokémon list is temporarily unavailable." })
    return null
  }
}

export default async function handler(req, res) {
  const session = await ensureSession(req, res)
  if (!session) return

  const releasedPokemonData = await loadReleasedPokemon(res)
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
      await prisma.$transaction([
        prisma.pokedexEntry.deleteMany({
          where: releasedDexNumbers.length
            ? {
                ownerId: session.user.id,
                dexNumber: { notIn: releasedDexNumbers },
              }
            : { ownerId: session.user.id },
        }),
        ...releasedDexNumbers.map((dexNumber) =>
          prisma.pokedexEntry.upsert({
            where: {
              ownerId_dexNumber: { ownerId: session.user.id, dexNumber },
            },
            update: {},
            create: { ownerId: session.user.id, dexNumber },
          })
        ),
      ])

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
