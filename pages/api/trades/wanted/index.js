import { getServerSession } from "next-auth/next"
import { authOptions } from "../../auth/[...nextauth]"
import prisma from "../../../../lib/prisma"
import pokedexByRegion from "../../../../lib/pokedexData"
import { getEligibleTradeUser } from "../../../../lib/tradeServer"
import {
  buildReleasedPokemonOptions,
  serializeWantedTrade,
  validateWantedTradePayload,
  wantedTradeDuplicateWhere,
  wantedTradeInclude,
} from "../../../../lib/wantedTradeUtils"

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions)

  if (!session) {
    return res.status(401).json({ error: "You must be logged in." })
  }

  const tradeUser = await getEligibleTradeUser(session)

  if (!tradeUser) {
    return res.status(403).json({
      error: "Add a valid 12-digit friend code to your account before using trades.",
      code: "FRIEND_CODE_REQUIRED",
    })
  }

  if (req.method === "GET") {
    const entries = await prisma.wantedTrade.findMany({
      include: wantedTradeInclude,
      orderBy: { createdAt: "desc" },
    })

    return res.status(200).json({
      entries: entries.map(serializeWantedTrade),
    })
  }

  if (req.method === "POST") {
    let releasedPokemonData

    try {
      const { getReleasedPokemonData } = require("../../../../lib/releasedPokemonCache")
      releasedPokemonData = await getReleasedPokemonData()
    } catch (error) {
      console.error("Unable to validate a wanted trade against released Pokémon", error)
      return res.status(503).json({
        error: "The released Pokémon list is temporarily unavailable.",
      })
    }

    const pokemonOptions = buildReleasedPokemonOptions(
      pokedexByRegion,
      releasedPokemonData.dexNumbers,
    )
    const validated = validateWantedTradePayload(req.body, pokemonOptions)

    if (validated.error) {
      return res.status(400).json({ error: validated.error })
    }

    const duplicate = await prisma.wantedTrade.findFirst({
      where: wantedTradeDuplicateWhere(tradeUser.id, validated.value),
      select: { id: true },
    })

    if (duplicate) {
      return res.status(409).json({
        error: "You already have this Pokémon with the same modifiers on your wanted list.",
      })
    }

    const entry = await prisma.wantedTrade.create({
      data: {
        ownerId: tradeUser.id,
        ...validated.value,
      },
      include: wantedTradeInclude,
    })

    return res.status(201).json(serializeWantedTrade(entry))
  }

  res.setHeader("Allow", ["GET", "POST"])
  return res.status(405).json({ error: "Method not allowed" })
}
