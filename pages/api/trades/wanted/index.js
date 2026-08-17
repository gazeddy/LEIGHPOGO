import { getServerSession } from "next-auth/next"
import { authOptions } from "../../auth/[...nextauth]"
import prisma from "../../../../lib/prisma"
import pokedexByRegion from "../../../../lib/pokedexData"
import { getAuthenticatedUser } from "../../../../lib/tradeServer"
import { recordUsageEvent } from "../../../../lib/usageEvents"
import {
  buildEffectiveReleasedPokemonOptions,
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

  const currentUser = await getAuthenticatedUser(session)

  if (!currentUser) {
    return res.status(401).json({ error: "Your account could not be found." })
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
    let pokemonOptions

    try {
      const { getReleasedPokemonData } = require("../../../../lib/releasedPokemonCache")
      const { readPokemonAvailabilityOverrides } = require("../../../../lib/pokemonAvailabilityStore")
      const releasedPokemonData = await getReleasedPokemonData()
      const overrideResult = await readPokemonAvailabilityOverrides()
      pokemonOptions = buildEffectiveReleasedPokemonOptions(
        pokedexByRegion,
        releasedPokemonData.dexNumbers,
        overrideResult.overrides,
      )
    } catch (error) {
      console.error("Unable to validate a wanted trade against effective Pokémon availability", error)
      return res.status(503).json({
        error: "The released Pokémon list is temporarily unavailable.",
      })
    }

    const validated = validateWantedTradePayload(req.body, pokemonOptions)

    if (validated.error) {
      return res.status(400).json({ error: validated.error })
    }

    const duplicate = await prisma.wantedTrade.findFirst({
      where: wantedTradeDuplicateWhere(currentUser.id, validated.value),
      select: { id: true },
    })

    if (duplicate) {
      return res.status(409).json({
        error: "You already have this Pokémon with the same modifiers on your wanted list.",
      })
    }

    const entry = await prisma.wantedTrade.create({
      data: {
        ownerId: currentUser.id,
        ...validated.value,
      },
      include: wantedTradeInclude,
    })

    await recordUsageEvent({
      type: "WANTED_TRADE_CREATED",
      ownerId: currentUser.id,
      path: "/trades/wanted",
      userAgent: req.headers["user-agent"],
      metadata: {
        wantedTradeId: entry.id,
        dexNumber: entry.dexNumber,
      },
    })

    return res.status(201).json(serializeWantedTrade(entry))
  }

  res.setHeader("Allow", ["GET", "POST"])
  return res.status(405).json({ error: "Method not allowed" })
}
