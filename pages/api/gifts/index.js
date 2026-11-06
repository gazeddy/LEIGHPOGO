import { getServerSession } from "next-auth/next"
import prisma from "../../../lib/prisma"
import { authOptions } from "../auth/[...nextauth]"

export const GIFT_COOLDOWN_MS = 24 * 60 * 60 * 1000

// Claims are per-account with a rolling 24-hour cooldown, rather than
// per-calendar-day, and each code is selected by the batch's earliest expiry.
export default async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) return res.status(405).json({ error: "Method not allowed" })
  const session = await getServerSession(req, res, authOptions)
  if (!session?.user?.id) return res.status(401).json({ error: "Sign in to claim gifts" })
  if (!session.user.privacyPolicyAccepted) return res.status(403).json({ error: "Accept the current privacy policy first" })
  const ownerId = Number(session.user.id)
  const lastClaim = async () => prisma.giftCode.findFirst({
    where: { ownerId },
    select: { code: true, claimedAt: true, batch: { select: { title: true, expiresAt: true } } },
    orderBy: [{ claimedAt: "desc" }, { id: "desc" }],
  })
  try {
    const now = new Date()
    const cutoff = new Date(now.getTime() - GIFT_COOLDOWN_MS)
    let claim = await lastClaim()
    if (req.method === "POST" && (!claim?.claimedAt || claim.claimedAt <= cutoff)) {
      // SQLite executes this as one atomic UPDATE. The NOT EXISTS condition
      // rechecks the cooldown inside the write to prevent concurrent double claims.
      await prisma.$executeRaw`
        UPDATE "GiftCode"
        SET "ownerId" = ${ownerId}, "claimedAt" = ${now}
        WHERE "id" = (
          SELECT gc."id" FROM "GiftCode" gc
          INNER JOIN "GiftBatch" gb ON gb."id" = gc."batchId"
          WHERE gc."ownerId" IS NULL AND gb."expiresAt" > ${now}
          ORDER BY gb."expiresAt" ASC, gb."createdAt" ASC, gc."id" ASC
          LIMIT 1
        )
        AND "ownerId" IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM "GiftCode" recent
          WHERE recent."ownerId" = ${ownerId} AND recent."claimedAt" > ${cutoff}
        )
      `
      claim = await lastClaim()
    }
    const remaining = await prisma.giftCode.count({
      where: { ownerId: null, batch: { expiresAt: { gt: new Date() } } },
    })
    const nextClaimAt = claim?.claimedAt ? new Date(claim.claimedAt.getTime() + GIFT_COOLDOWN_MS) : null
    return res.status(200).json({
      title: "LeighPogo Community Gift",
      claim: claim ? { code: claim.code, claimedAt: claim.claimedAt, batchTitle: claim.batch.title, expiresAt: claim.batch.expiresAt } : null,
      nextClaimAt,
      canClaim: !nextClaimAt || nextClaimAt <= new Date(),
      remaining,
    })
  } catch (error) {
    console.error("Gift pool claim failed", error)
    return res.status(500).json({ error: "Unable to process gift claim" })
  }
}
