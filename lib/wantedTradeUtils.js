import { normalizeFriendCode } from "./tradeUtils"

const MAX_NOTES_LENGTH = 250

const cleanText = (value, maxLength) =>
  String(value ?? "").trim().slice(0, maxLength)

export const wantedTradeInclude = {
  owner: {
    select: {
      id: true,
      ign: true,
      entries: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { code: true },
      },
    },
  },
}

export const buildReleasedPokemonOptions = (
  pokedexByRegion,
  releasedDexNumbers,
) => {
  const releasedSet = new Set(
    releasedDexNumbers
      .map((dexNumber) => Number(dexNumber))
      .filter((dexNumber) => Number.isInteger(dexNumber) && dexNumber > 0),
  )

  return pokedexByRegion
    .flatMap((region) => region.pokemon)
    .filter((pokemon) => releasedSet.has(pokemon.dexNumber))
    .map((pokemon) => ({
      dexNumber: pokemon.dexNumber,
      name: pokemon.name,
    }))
}

export const validateWantedTradePayload = (payload = {}, pokemonOptions = []) => {
  const dexNumber = Number(payload.dexNumber)
  const pokemon = pokemonOptions.find((option) => option.dexNumber === dexNumber)

  if (!pokemon) {
    return { error: "Select a released Pokémon from the list." }
  }

  const xxl = Boolean(payload.xxl)
  const xxs = Boolean(payload.xxs)

  if (xxl && xxs) {
    return { error: "A wanted Pokémon cannot be both XXL and XXS." }
  }

  return {
    value: {
      dexNumber: pokemon.dexNumber,
      pokemonName: pokemon.name,
      shiny: Boolean(payload.shiny),
      lucky: Boolean(payload.lucky),
      xxl,
      xxs,
      costume: Boolean(payload.costume),
      background: Boolean(payload.background),
      dynamax: Boolean(payload.dynamax),
      gigantamax: Boolean(payload.gigantamax),
      notes: cleanText(payload.notes, MAX_NOTES_LENGTH) || null,
    },
  }
}

export const wantedTradeDuplicateWhere = (ownerId, value) => ({
  ownerId,
  dexNumber: value.dexNumber,
  shiny: value.shiny,
  lucky: value.lucky,
  xxl: value.xxl,
  xxs: value.xxs,
  costume: value.costume,
  background: value.background,
  dynamax: value.dynamax,
  gigantamax: value.gigantamax,
})

export const serializeWantedTrade = (entry) => ({
  id: entry.id,
  ownerId: entry.ownerId,
  owner: {
    id: entry.owner?.id,
    ign: entry.owner?.ign || "Unknown trainer",
    friendCode: normalizeFriendCode(entry.owner?.entries?.[0]?.code),
  },
  dexNumber: entry.dexNumber,
  pokemonName: entry.pokemonName,
  shiny: entry.shiny,
  lucky: entry.lucky,
  xxl: entry.xxl,
  xxs: entry.xxs,
  costume: entry.costume,
  background: entry.background,
  dynamax: entry.dynamax,
  gigantamax: entry.gigantamax,
  notes: entry.notes,
  createdAt: entry.createdAt.toISOString(),
  updatedAt: entry.updatedAt.toISOString(),
})
