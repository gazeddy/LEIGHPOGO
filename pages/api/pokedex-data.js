import { getServerSession } from "next-auth/next"
import { authOptions } from "./auth/[...nextauth]"

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"])
    res.status(405).end("Method Not Allowed")
    return
  }

  const session = await getServerSession(req, res, authOptions)
  if (!session) {
    res.status(401).json({ error: "You must be signed in to view Pokédex details." })
    return
  }

  try {
    const { getPokedexInfoData } = require("../../lib/pokedexInfoCache")
    const pokedexInfo = await getPokedexInfoData()

    res.setHeader("Cache-Control", "private, max-age=3600, stale-while-revalidate=86400")
    res.status(200).json({
      ...pokedexInfo.data,
      source: "POGOAPI",
      refreshedAt: pokedexInfo.checkedAt,
      stale: pokedexInfo.stale,
    })
  } catch (error) {
    console.error("Failed to load Pokédex information from POGOAPI", error)
    res.status(502).json({
      error: "Pokédex battle and evolution information is temporarily unavailable.",
    })
  }
}
