import prisma from "./prisma"

const modifierDefinitions = [
  ["shiny", "Shiny"],
  ["lucky", "Lucky"],
  ["xxl", "XXL"],
  ["xxs", "XXS"],
  ["costume", "Costume"],
  ["background", "Special background"],
  ["dynamax", "Dynamax"],
  ["gigantamax", "Gigantamax"],
]

const normalizedName = (value) => String(value ?? "").trim().toLowerCase()

const summarizeTrainerNames = (names) => {
  const uniqueNames = Array.from(
    new Set(names.map((name) => String(name ?? "").trim()).filter(Boolean)),
  )

  if (uniqueNames.length === 0) return "another trainer"
  if (uniqueNames.length === 1) return uniqueNames[0]
  if (uniqueNames.length === 2) return `${uniqueNames[0]} and ${uniqueNames[1]}`
  if (uniqueNames.length === 3) {
    return `${uniqueNames[0]}, ${uniqueNames[1]} and ${uniqueNames[2]}`
  }

  return `${uniqueNames[0]}, ${uniqueNames[1]} and ${uniqueNames.length - 2} other trainers`
}

export const wantedTradeMatchesOffer = (wanted, offer) =>
  normalizedName(wanted?.pokemonName) === normalizedName(offer?.pokemonName) &&
  modifierDefinitions.every(([key]) => !wanted?.[key] || Boolean(offer?.[key]))

export const tradeModifierLabels = (item) =>
  modifierDefinitions
    .filter(([key]) => Boolean(item?.[key]))
    .map(([, label]) => label)

export const tradeNotificationInclude = {
  listing: {
    select: {
      id: true,
      status: true,
      expiresAt: true,
      owner: {
        select: {
          id: true,
          ign: true,
        },
      },
    },
  },
}

export const serializeTradeNotification = (notification) => ({
  id: notification.id,
  listingId: notification.listingId,
  type: notification.type || "WISHLIST_MATCH",
  pokemonName: notification.pokemonName,
  modifierSummary: notification.modifierSummary,
  matchedTrainerSummary: notification.matchedTrainerSummary,
  matchedTrainerCount: notification.matchedTrainerCount || 0,
  createdAt: notification.createdAt.toISOString(),
  readAt: notification.readAt?.toISOString() || null,
  listing: {
    id: notification.listing?.id,
    status: notification.listing?.status || "UNKNOWN",
    expiresAt: notification.listing?.expiresAt?.toISOString() || null,
    owner: {
      id: notification.listing?.owner?.id,
      ign: notification.listing?.owner?.ign || "Unknown trainer",
    },
  },
})

export async function syncWantedTradeNotificationsForListing(listing) {
  const offeredItems = (listing?.items || []).filter(
    (item) => item.direction === "OFFER",
  )

  if (!listing?.id || !listing?.ownerId || offeredItems.length === 0) {
    return []
  }

  const wantedEntries = await prisma.wantedTrade.findMany({
    where: {
      ownerId: { not: listing.ownerId },
    },
    include: {
      owner: {
        select: { ign: true },
      },
    },
  })

  const wishlistNotifications = new Map()
  const listingOwnerMatches = new Map()

  for (const wanted of wantedEntries) {
    const offer = offeredItems.find((item) =>
      wantedTradeMatchesOffer(wanted, item),
    )

    if (!offer) continue

    const pokemonKey = normalizedName(wanted.pokemonName)
    const wishlistKey = `${wanted.ownerId}:${pokemonKey}`

    if (!wishlistNotifications.has(wishlistKey)) {
      wishlistNotifications.set(wishlistKey, {
        ownerId: wanted.ownerId,
        listingId: listing.id,
        type: "WISHLIST_MATCH",
        pokemonName: wanted.pokemonName,
        modifierSummary: tradeModifierLabels(offer).join(", ") || null,
        matchedTrainerSummary: null,
        matchedTrainerCount: 0,
      })
    }

    const ownerMatch = listingOwnerMatches.get(pokemonKey) || {
      offer,
      pokemonName: wanted.pokemonName,
      trainerNames: new Set(),
    }

    ownerMatch.trainerNames.add(wanted.owner?.ign || "Another trainer")
    listingOwnerMatches.set(pokemonKey, ownerMatch)
  }

  const listingOwnerNotifications = Array.from(listingOwnerMatches.values()).map(
    ({ offer, pokemonName, trainerNames }) => {
      const names = Array.from(trainerNames)

      return {
        ownerId: listing.ownerId,
        listingId: listing.id,
        type: "LISTING_MATCH",
        pokemonName,
        modifierSummary: tradeModifierLabels(offer).join(", ") || null,
        matchedTrainerSummary: summarizeTrainerNames(names),
        matchedTrainerCount: names.length,
      }
    },
  )

  const notifications = [
    ...Array.from(wishlistNotifications.values()),
    ...listingOwnerNotifications,
  ]

  return Promise.all(
    notifications.map((notification) =>
      prisma.tradeNotification.upsert({
        where: {
          ownerId_listingId_pokemonName: {
            ownerId: notification.ownerId,
            listingId: notification.listingId,
            pokemonName: notification.pokemonName,
          },
        },
        create: notification,
        update: {
          type: notification.type,
          modifierSummary: notification.modifierSummary,
          matchedTrainerSummary: notification.matchedTrainerSummary,
          matchedTrainerCount: notification.matchedTrainerCount,
        },
      }),
    ),
  )
}
