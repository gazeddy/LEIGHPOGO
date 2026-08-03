import { getServerSession } from "next-auth/next"
import { authOptions } from "../auth/[...nextauth]"

const {
  deletePokemonRegionalOverride,
  readPokemonRegionalOverrides,
  savePokemonRegionalOverride,
} = require("../../../lib/pokemonRegionalStore")

async function requireAdmin(req, res) {
  const session = await getServerSession(req, res, authOptions)
  return session?.user?.role === "admin"
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate")
  res.setHeader("CDN-Cache-Control", "no-store")
  res.setHeader("Pragma", "no-cache")
  res.setHeader("Expires", "0")

  if (!(await requireAdmin(req, res))) {
    res.status(403).json({ error: "Access denied" })
    return
  }

  try {
    if (req.method === "GET") {
      res.status(200).json(await readPokemonRegionalOverrides())
      return
    }

    if (req.method === "PUT") {
      const result = await savePokemonRegionalOverride(req.body)
      res.status(200).json({
        ...result,
        message: `Pokémon regional status saved to ${result.storage} storage.`,
      })
      return
    }

    if (req.method === "DELETE") {
      const result = await deletePokemonRegionalOverride(req.query.dexNumber)
      if (!result.deleted) {
        res.status(404).json({ error: "Pokémon regional status not found." })
        return
      }
      res.status(200).json({
        ...result,
        message: `Pokémon regional status reset in ${result.storage} storage.`,
      })
      return
    }

    res.setHeader("Allow", ["GET", "PUT", "DELETE"])
    res.status(405).json({ error: "Method not allowed" })
  } catch (error) {
    console.error("Pokémon regional status request failed", error)
    res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "The Pokémon regional status could not be saved.",
    })
  }
}
