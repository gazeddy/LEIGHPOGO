import { getServerSession } from "next-auth/next"
import prisma from "../../lib/prisma"
import { authOptions } from "./auth/[...nextauth]"

const { applyPokemonAvailabilityOverrides } = require("../../lib/pokemonAvailability")

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

    let pogoApiReleasedDexNumbers = []
    let releasedDexNumbers = []
    let releaseDataStale = false
    let availabilityKnown = true

    try {
      const [releasedPokemon, overrides] = await Promise.all([
        getReleasedPokemonData(),
        prisma.pokemonAvailabilityOverride.findMany({
          select: { dexNumber: true, released: true },
        }),
      ])
      pogoApiReleasedDexNumbers = releasedPokemon.dexNumbers
      releasedDexNumbers = applyPokemonAvailabilityOverrides(
        pogoApiReleasedDexNumbers,
        overrides
      )
      releaseDataStale = releasedPokemon.stale
    } catch (error) {
      availabilityKnown = false
      console.error("Unable to load Pokémon release status for the Pokédex", error)
    }

    res.setHeader("Cache-Control", "private, no-store")
    res.status(200).json({
      ...catalog.data,
      pogoApiReleasedDexNumbers,
      releasedDexNumbers,
      availabilityKnown,
      stale: catalog.stale || releaseDataStale,
      checkedAt: catalog.checkedAt,
      source: "POGOAPI + PvPoke + admin overrides",
    })
  } catch (error) {
    console.error("Unable to load the Pokédex catalog", error)
    res.status(502).json({
      error: "The Pokédex data is temporarily unavailable. Please try again shortly.",
    })
  }
}
