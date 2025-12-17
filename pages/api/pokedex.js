import { getServerSession } from "next-auth/next"
import { authOptions } from "./auth/[...nextauth]"
import prisma from "../../lib/prisma"

async function ensureSession(req, res) {
  const session = await getServerSession(req, res, authOptions)
  if (!session) {
    res.status(401).json({ error: "You must be signed in to manage your Pokédex." })
    return null
  }
  return session
}

export default async function handler(req, res) {
  const session = await ensureSession(req, res)
  if (!session) return

  if (req.method === "GET") {
    try {
      const entries = await prisma.pokedexEntry.findMany({
        where: { ownerId: session.user.id },
        select: { dexNumber: true },
      })

      res.status(200).json({ dexNumbers: entries.map((entry) => entry.dexNumber) })
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

    const uniqueDexNumbers = Array.from(
      new Set(
        dexNumbers
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value > 0)
      )
    )

    try {
      await prisma.$transaction([
        prisma.pokedexEntry.deleteMany({
          where: {
            ownerId: session.user.id,
            dexNumber: { notIn: uniqueDexNumbers },
          },
        }),
        ...uniqueDexNumbers.map((dexNumber) =>
          prisma.pokedexEntry.upsert({
            where: {
              ownerId_dexNumber: { ownerId: session.user.id, dexNumber },
            },
            update: {},
            create: { ownerId: session.user.id, dexNumber },
          })
        ),
      ])

      res.status(200).json({ dexNumbers: uniqueDexNumbers })
    } catch (error) {
      console.error("Failed to save Pokédex entries", error)
      res.status(500).json({ error: "Unable to save your Pokédex right now." })
    }
    return
  }

  res.setHeader("Allow", ["GET", "PUT"])
  res.status(405).end("Method Not Allowed")
}
