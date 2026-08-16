import { getServerSession } from "next-auth/next"
import { authOptions } from "../auth/[...nextauth]"
import prisma from "../../../lib/prisma"
import {
  getEligibleTradeUser,
  purgeExpiredTradeListings,
  tradeListingInclude,
} from "../../../lib/tradeServer"
import { syncWantedTradeNotificationsForListing } from "../../../lib/tradeNotifications"
import { recordUsageEvent } from "../../../lib/usageEvents"
import {
  addOneMonth,
  serializeTradeListing,
  validateTradeListingPayload,
} from "../../../lib/tradeUtils"

const createMatchNotifications = async (listing) => {
  try {
    await syncWantedTradeNotificationsForListing(listing)
  } catch (error) {
    console.error("Unable to create wishlist match notifications", error)
  }
}

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

  await purgeExpiredTradeListings()

  if (req.method === "GET") {
    const listings = await prisma.tradeListing.findMany({
      where: {
        status: "ACTIVE",
        expiresAt: { gt: new Date() },
      },
      include: tradeListingInclude,
      orderBy: { createdAt: "desc" },
    })

    return res.status(200).json({
      listings: listings.map(serializeTradeListing),
    })
  }

  if (req.method === "POST") {
    const validated = validateTradeListingPayload(req.body)

    if (validated.error) {
      return res.status(400).json({ error: validated.error })
    }

    const createdAt = new Date()
    const listing = await prisma.tradeListing.create({
      data: {
        ownerId: tradeUser.id,
        friendshipRequirement: validated.value.friendshipRequirement,
        location: validated.value.location,
        notes: validated.value.notes,
        status: "ACTIVE",
        createdAt,
        expiresAt: addOneMonth(createdAt),
        items: {
          create: validated.value.items,
        },
      },
      include: tradeListingInclude,
    })

    await createMatchNotifications(listing)
    await recordUsageEvent({
      type: "TRADE_CREATED",
      ownerId: tradeUser.id,
      path: "/trades/new",
      userAgent: req.headers["user-agent"],
      metadata: { listingId: listing.id },
    })

    return res.status(201).json(serializeTradeListing(listing))
  }

  res.setHeader("Allow", ["GET", "POST"])
  return res.status(405).json({ error: "Method not allowed" })
}
