import { getServerSession } from "next-auth/next"
import { authOptions } from "./auth/[...nextauth]"

const { applyPokemonAvailabilityOverrides } = require("../../lib/pokemonAvailability")
const { readPokemonAvailabilityOverrides } = require("../../lib/pokemonAvailabilityStore")

function disableCaching(res) {
  res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate")
  res.setHeader("CDN-Cache-Control", "no-store")
  res.setHeader("Pragma", "no-cache")
  res.setHeader("Expires", "0")
}

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

  disableCaching(res)

  try {
    const { getPokedexCatalogData } = require("../../lib/pokedexCatalogCache")
    const { getReleasedPokemonData } = require("../../lib/releasedPokemonCache")
    const catalog = await getPokedexCatalogData()

    let pogoApiReleasedDexNumbers = []
    let releasedDexNumbers = []
    let releaseDataStale = false
    let availabilityKnown = true
    let overrideStorage = null
    let overrideDataAvailable = true
    let overrideWarning = null

    try {
      const releasedPokemon = await getReleasedPokemonData()
      pogoApiReleasedDexNumbers = releasedPokemon.dexNumbers
      releasedDexNumbers = releasedPokemon.dexNumbers
      releaseDataStale = releasedPokemon.stale
    } catch (error) {
      availabilityKnown = false
      console.error("Unable to load POGOAPI release status for the Pokédex", error)
    }

    try {
      const overrideResult = await readPokemonAvailabilityOverrides()
      overrideStorage = overrideResult.storage
      if (availabilityKnown) {
        releasedDexNumbers = applyPokemonAvailabilityOverrides(
          pogoApiReleasedDexNumbers,
          overrideResult.overrides
        )
      }
    } catch (error) {
      overrideDataAvailable = false
      overrideWarning =
        error instanceof Error
          ? error.message
          : "Pokémon availability overrides are temporarily unavailable."
      console.error("Unable to load Pokémon availability overrides", error)
    }

    res.status(200).json({
      ...catalog.data,
      catalogVersion: 5,
      pogoApiReleasedDexNumbers,
      releasedDexNumbers,
      availabilityKnown,
      overrideDataAvailable,
      overrideStorage,
      overrideWarning,
      stale: catalog.stale || releaseDataStale,
      checkedAt: catalog.checkedAt,
      source: "Site Pokédex + PvPoke/POGOAPI metadata + admin availability overrides",
    })
  } catch (error) {
    console.error("Unable to load the Pokédex catalog", error)
    res.status(502).json({
      error: "The Pokédex data is temporarily unavailable. Please try again shortly.",
    })
  }
}
