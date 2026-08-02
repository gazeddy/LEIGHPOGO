import { getServerSession } from "next-auth/next"
import prisma from "../../../lib/prisma"
import { authOptions } from "../auth/[...nextauth]"

function parseDexNumber(value) {
  const dexNumber = Number(value)
  return Number.isInteger(dexNumber) && dexNumber > 0 ? dexNumber : null
}

function optionalNote(value) {
  if (typeof value !== "string") return null
  const note = value.trim()
  return note ? note.slice(0, 500) : null
}

async function requireAdmin(req, res) {
  const session = await getServerSession(req, res, authOptions)
  return session?.user?.role === "admin"
}

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) {
    res.status(403).json({ error: "Access denied" })
    return
  }

  try {
    if (req.method === "GET") {
      const overrides = await prisma.pokemonAvailabilityOverride.findMany({
        orderBy: { dexNumber: "asc" },
      })
      res.status(200).json({ overrides })
      return
    }

    if (req.method === "PUT") {
      const dexNumber = parseDexNumber(req.body?.dexNumber)
      if (!dexNumber || typeof req.body?.released !== "boolean") {
        res.status(400).json({ error: "A valid Pokédex number and release status are required." })
        return
      }

      const override = await prisma.pokemonAvailabilityOverride.upsert({
        where: { dexNumber },
        create: {
          dexNumber,
          released: req.body.released,
          note: optionalNote(req.body.note),
        },
        update: {
          released: req.body.released,
          note: optionalNote(req.body.note),
        },
      })

      res.status(200).json({ override, message: "Pokémon availability override saved." })
      return
    }

    if (req.method === "DELETE") {
      const dexNumber = parseDexNumber(req.query.dexNumber)
      if (!dexNumber) {
        res.status(400).json({ error: "A valid Pokédex number is required." })
        return
      }

      const result = await prisma.pokemonAvailabilityOverride.deleteMany({
        where: { dexNumber },
      })

      if (!result.count) {
        res.status(404).json({ error: "Pokémon availability override not found." })
        return
      }

      res.status(200).json({ message: "Pokémon availability override reset." })
      return
    }

    res.setHeader("Allow", ["GET", "PUT", "DELETE"])
    res.status(405).json({ error: "Method not allowed" })
  } catch (error) {
    console.error("Pokémon availability override request failed", error)
    res.status(500).json({ error: "The Pokémon availability override could not be saved." })
  }
}
