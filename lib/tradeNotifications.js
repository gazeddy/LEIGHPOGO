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
  pokemonName: notification.pokemonName,
  modifierSummary: notification.modifierSummary,
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
  })

  const matches = new Map()

  for (const wanted of wantedEntries) {
    const offer = offeredItems.find((item) =>
      wantedTradeMatchesOffer(wanted, item),
    )

    if (!offer) continue

    const key = `${wanted.ownerId}:${normalizedName(wanted.pokemonName)}`
    if (matches.has(key)) continue

    matches.set(key, {
      ownerId: wanted.ownerId,
      listingId: listing.id,
      pokemonName: wanted.pokemonName,
      modifierSummary: tradeModifierLabels(offer).join(", ") || null,
    })
  }

  return Promise.all(
    Array.from(matches.values()).map((match) =>
      prisma.tradeNotification.upsert({
        where: {
          ownerId_listingId_pokemonName: {
            ownerId: match.ownerId,
            listingId: match.listingId,
            pokemonName: match.pokemonName,
          },
        },
        create: match,
        update: {
          modifierSummary: match.modifierSummary,
        },
      }),
    ),
  )
}
