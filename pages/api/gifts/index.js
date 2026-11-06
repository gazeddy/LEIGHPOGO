import { getServerSession } from "next-auth/next"
import prisma from "../../../lib/prisma"
import { authOptions } from "../auth/[...nextauth]"

// One shared gift pool: oldest expiry is always served first.
// A conditional SQLite statement makes the choice and assignment together,
// including the account-level duplicate guard, so competing scans cannot double-claim.
export default async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) return res.status(405).json({ error: "Method not allowed" })
  const session = await getServerSession(req, res, authOptions)
  if (!session?.user?.id) return res.status(401).json({ error: "Sign in to claim gifts" })
  if (!session.user.privacyPolicyAccepted) return res.status(403).json({ error: "Accept the current privacy policy first" })
  const ownerId = Number(session.user.id)
  const existing = async () => prisma.giftCode.findFirst({
    where: { ownerId },
    select: { code: true, claimedAt: true, batch: { select: { title: true, expiresAt: true } } },
    orderBy: [{ claimedAt: "asc" }, { id: "asc" }],
  })
  try {
    let claim = await existing()
    if (req.method === "POST" && !claim) {
      const now = new Date()
      // Atomically choose a code across ALL batches ordered by soonest expiry.
      // The NOT EXISTS predicate prevents two simultaneous requests from the
      // same user acquiring two codes, even from different batches.
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
        AND NOT EXISTS (SELECT 1 FROM "GiftCode" WHERE "ownerId" = ${ownerId})
      `
      claim = await existing()
    }
    const remaining = await prisma.giftCode.count({
      where: { ownerId: null, batch: { expiresAt: { gt: new Date() } } },
    })
    return res.status(200).json({
      title: "LeighPogo Community Gift",
      claim: claim ? { code: claim.code, claimedAt: claim.claimedAt, batchTitle: claim.batch.title, expiresAt: claim.batch.expiresAt } : null,
      remaining,
    })
  } catch (error) {
    console.error("Gift pool claim failed", error)
    return res.status(500).json({ error: "Unable to process gift claim" })
  }
}
