import { getServerSession } from "next-auth/next"
import { authOptions } from "../auth/[...nextauth]"
import prisma from "../../../lib/prisma"
import {
  getEligibleTradeUser,
  purgeExpiredTradeListings,
  tradeListingInclude,
} from "../../../lib/tradeServer"
import {
  serializeTradeListing,
  validateTradeListingPayload,
} from "../../../lib/tradeUtils"

const VALID_STATUSES = ["ACTIVE", "CLOSED"]

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

  const listingId = Number(req.query.id)

  if (!Number.isInteger(listingId)) {
    return res.status(400).json({ error: "Invalid listing ID" })
  }

  const listing = await prisma.tradeListing.findUnique({
    where: { id: listingId },
    include: tradeListingInclude,
  })

  if (!listing) {
    return res.status(404).json({ error: "Trade listing not found" })
  }

  const isOwner = listing.ownerId === tradeUser.id
  const isAdmin = tradeUser.role === "admin"

  if (req.method === "GET") {
    if (listing.status !== "ACTIVE" && !isOwner && !isAdmin) {
      return res.status(404).json({ error: "Trade listing not found" })
    }

    return res.status(200).json(serializeTradeListing(listing))
  }

  if (req.method === "PUT") {
    if (!isOwner) {
      return res.status(403).json({ error: "You can only edit your own trade listings." })
    }

    const requestedStatus = req.body?.status
      ? String(req.body.status).toUpperCase()
      : listing.status

    if (!VALID_STATUSES.includes(requestedStatus)) {
      return res.status(400).json({ error: "Invalid listing status" })
    }

    const hasListingContent = ["location", "notes", "offeredItems", "wantedItems"].some(
      (key) => Object.prototype.hasOwnProperty.call(req.body || {}, key)
    )

    let data = { status: requestedStatus }

    if (hasListingContent) {
      const validated = validateTradeListingPayload(req.body)

      if (validated.error) {
        return res.status(400).json({ error: validated.error })
      }

      data = {
        ...data,
        location: validated.value.location,
        notes: validated.value.notes,
        items: {
          deleteMany: {},
          create: validated.value.items,
        },
      }
    }

    const updated = await prisma.tradeListing.update({
      where: { id: listingId },
      data,
      include: tradeListingInclude,
    })

    return res.status(200).json(serializeTradeListing(updated))
  }

  if (req.method === "DELETE") {
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: "You cannot remove this trade listing." })
    }

    await prisma.tradeListing.delete({ where: { id: listingId } })
    return res.status(204).end()
  }

  res.setHeader("Allow", ["GET", "PUT", "DELETE"])
  return res.status(405).json({ error: "Method not allowed" })
}
