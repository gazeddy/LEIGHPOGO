import prisma from "./prisma"
import { normalizeFriendCode } from "./tradeUtils"

export const tradeListingInclude = {
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
  items: {
    orderBy: [{ direction: "asc" }, { id: "asc" }],
  },
}

export const getEligibleTradeUser = async (session) => {
  const userId = Number(session?.user?.id)

  if (!Number.isInteger(userId)) return null

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      ign: true,
      role: true,
      entries: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { code: true },
      },
    },
  })

  const friendCode = normalizeFriendCode(user?.entries?.[0]?.code)

  if (!user || !friendCode) return null

  return {
    id: user.id,
    ign: user.ign,
    role: user.role,
    friendCode,
  }
}

export const purgeExpiredTradeListings = async () =>
  prisma.tradeListing.deleteMany({
    where: {
      expiresAt: { lte: new Date() },
    },
  })
