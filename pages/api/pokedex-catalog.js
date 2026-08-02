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
    res.status(401).json({ error: "You must be signed in to view the Pokédex." })
    return
  }

  try {
    const { getPokedexCatalogData } = require("../../lib/pokedexCatalogCache")
    const { getReleasedPokemonData } = require("../../lib/releasedPokemonCache")
    const catalog = await getPokedexCatalogData()

    let releasedDexNumbers = []
    let releaseDataStale = false
    let availabilityKnown = true

    try {
      const releasedPokemon = await getReleasedPokemonData()
      releasedDexNumbers = releasedPokemon.dexNumbers
      releaseDataStale = releasedPokemon.stale
    } catch (error) {
      availabilityKnown = false
      console.error("Unable to load POGOAPI release status for the Pokédex", error)
    }

    res.setHeader("Cache-Control", "private, max-age=3600, stale-while-revalidate=86400")
    res.status(200).json({
      ...catalog.data,
      releasedDexNumbers,
      availabilityKnown,
      stale: catalog.stale || releaseDataStale,
      checkedAt: catalog.checkedAt,
      source: "POGOAPI",
    })
  } catch (error) {
    console.error("Unable to load the POGOAPI Pokédex catalog", error)
    res.status(502).json({
      error: "The Pokédex data is temporarily unavailable. Please try again shortly.",
    })
  }
}
