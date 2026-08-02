import { formatFriendCode, normalizeFriendCode } from "./friendCode"

export { formatFriendCode, normalizeFriendCode }

export const TRADE_FRIENDSHIP_REQUIREMENTS = [
  { value: "ANY", label: "Any friendship level" },
  { value: "GOOD", label: "Good Friends or higher" },
  { value: "GREAT", label: "Great Friends or higher" },
  { value: "ULTRA", label: "Ultra Friends or higher" },
  { value: "BEST", label: "Best Friends only" },
  { value: "LUCKY", label: "Lucky Friends only" },
]

const TRADE_FRIENDSHIP_VALUES = new Set(
  TRADE_FRIENDSHIP_REQUIREMENTS.map(({ value }) => value),
)

export const normalizeTradeFriendshipRequirement = (value = "ANY") => {
  const normalized = String(value ?? "ANY").trim().toUpperCase()
  return TRADE_FRIENDSHIP_VALUES.has(normalized) ? normalized : null
}

export const tradeFriendshipRequirementLabel = (value) =>
  TRADE_FRIENDSHIP_REQUIREMENTS.find(
    (option) => option.value === normalizeTradeFriendshipRequirement(value),
  )?.label || TRADE_FRIENDSHIP_REQUIREMENTS[0].label

const MAX_ITEMS_PER_SIDE = 20
const MAX_POKEMON_NAME_LENGTH = 100
const MAX_ITEM_NOTES_LENGTH = 250
const MAX_LOCATION_LENGTH = 120
const MAX_LISTING_NOTES_LENGTH = 1000

const cleanText = (value, maxLength) =>
  String(value ?? "").trim().slice(0, maxLength)

export const addOneMonth = (value = new Date()) => {
  const source = new Date(value)
  const result = new Date(value)
  const originalDay = result.getUTCDate()

  result.setUTCDate(1)
  result.setUTCMonth(result.getUTCMonth() + 1)

  const lastDayOfTargetMonth = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)
  ).getUTCDate()

  result.setUTCDate(Math.min(originalDay, lastDayOfTargetMonth))
  return result
}

const normalizeItems = (items, direction) => {
  if (!Array.isArray(items) || items.length === 0) {
    return { error: `Add at least one Pokémon you ${direction === "OFFER" ? "are offering" : "want"}.` }
  }

  if (items.length > MAX_ITEMS_PER_SIDE) {
    return { error: `A listing can contain no more than ${MAX_ITEMS_PER_SIDE} Pokémon on each side.` }
  }

  const normalized = []

  for (const item of items) {
    const pokemonName = cleanText(item?.pokemonName, MAX_POKEMON_NAME_LENGTH)

    if (!pokemonName) {
      return { error: "Every trade item needs a Pokémon name." }
    }

    const xxl = Boolean(item?.xxl)
    const xxs = Boolean(item?.xxs)

    if (xxl && xxs) {
      return { error: `${pokemonName} cannot be both XXL and XXS.` }
    }

    normalized.push({
      direction,
      pokemonName,
      shiny: Boolean(item?.shiny),
      lucky: Boolean(item?.lucky),
      xxl,
      xxs,
      costume: Boolean(item?.costume),
      background: Boolean(item?.background),
      dynamax: Boolean(item?.dynamax),
      gigantamax: Boolean(item?.gigantamax),
      notes: cleanText(item?.notes, MAX_ITEM_NOTES_LENGTH) || null,
    })
  }

  return { items: normalized }
}

export const validateTradeListingPayload = (payload = {}) => {
  const offered = normalizeItems(payload.offeredItems, "OFFER")
  if (offered.error) return offered

  const wanted = normalizeItems(payload.wantedItems, "WANT")
  if (wanted.error) return wanted

  const friendshipRequirement = normalizeTradeFriendshipRequirement(
    payload.friendshipRequirement,
  )

  if (!friendshipRequirement) {
    return { error: "Select a valid friendship requirement." }
  }

  return {
    value: {
      friendshipRequirement,
      location: cleanText(payload.location, MAX_LOCATION_LENGTH) || null,
      notes: cleanText(payload.notes, MAX_LISTING_NOTES_LENGTH) || null,
      items: [...offered.items, ...wanted.items],
    },
  }
}

export const serializeTradeListing = (listing) => {
  const ownerEntry = listing.owner?.entries?.[0]

  return {
    id: listing.id,
    ownerId: listing.ownerId,
    owner: {
      id: listing.owner?.id,
      ign: listing.owner?.ign || "Unknown trainer",
      friendCode: normalizeFriendCode(ownerEntry?.code),
    },
    friendshipRequirement:
      normalizeTradeFriendshipRequirement(listing.friendshipRequirement) || "ANY",
    location: listing.location,
    notes: listing.notes,
    status: listing.status,
    createdAt: listing.createdAt.toISOString(),
    updatedAt: listing.updatedAt.toISOString(),
    expiresAt: listing.expiresAt.toISOString(),
    items: listing.items.map((item) => ({
      id: item.id,
      direction: item.direction,
      pokemonName: item.pokemonName,
      shiny: item.shiny,
      lucky: item.lucky,
      xxl: item.xxl,
      xxs: item.xxs,
      costume: item.costume,
      background: item.background,
      dynamax: item.dynamax,
      gigantamax: item.gigantamax,
      notes: item.notes,
    })),
  }
}
