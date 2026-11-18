import { getServerSession } from "next-auth/next"
import prisma from "../../../lib/prisma"
import { validGiftQr } from "../../../lib/giftQr"
import { authOptions } from "../auth/[...nextauth]"

export const GIFT_COOLDOWN_MS = 24 * 60 * 60 * 1000

function auditLookup(ownerId, claimantIgnKey) {
  return { OR: [{ claimantUserId: ownerId }, { claimantIgnKey }] }
}

function responseClaim(audit) {
  if (!audit) return null
  return {
    code: audit.code,
    claimedAt: audit.claimedAt,
    batchTitle: audit.batchTitle,
    expiresAt: audit.batchExpiresAt,
    redeemUrl: "https://store.pokemongo.com/offer-redemption?passcode=" + encodeURIComponent(audit.code),
  }
}

// Audit entries do not reference User/GiftBatch: deleting either cannot recycle
// an issued code or erase its history. Every allocation and audit insert is one
// SQLite transaction, with the 24-hour check repeated in the atomic UPDATE.
export default async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) return res.status(405).json({ error: "Method not allowed" })
  const session = await getServerSession(req, res, authOptions)
  if (!session?.user?.id) return res.status(401).json({ error: "Sign in to claim gifts" })
  if (!session.user.privacyPolicyAccepted) return res.status(403).json({ error: "Accept the current privacy policy first" })
  const qrToken = req.method === "GET" ? req.query?.qr : req.body?.qr
  if (!validGiftQr(qrToken)) return res.status(410).json({ error: "This gift QR has expired or is invalid. Scan the current QR to claim a code." })

  const ownerId = Number(session.user.id)
  if (!Number.isSafeInteger(ownerId) || ownerId < 1) return res.status(401).json({ error: "Invalid account" })
  try {
    // Load current IGN from the database, never trust an IGN sent by the client.
    const account = await prisma.user.findUnique({ where: { id: ownerId }, select: { ign: true } })
    if (!account?.ign) return res.status(401).json({ error: "Account no longer exists" })
    const claimantIgn = account.ign
    const claimantIgnKey = claimantIgn.trim().toLowerCase()
    const now = new Date()
    const cutoff = new Date(now.getTime() - GIFT_COOLDOWN_MS)
    let claim

    if (req.method === "POST") {
      claim = await prisma.$transaction(async (tx) => {
        let latest = await tx.giftClaimAudit.findFirst({
          where: auditLookup(ownerId, claimantIgnKey),
          orderBy: [{ claimedAt: "desc" }, { id: "desc" }],
        })
        if (latest?.claimedAt > cutoff) return latest

        // No orphaned (previously claimed) code may ever re-enter the pool.
        // A repeated registration with the same IGN retains its cooldown.
        const updated = await tx.$executeRaw`
          UPDATE "GiftCode"
          SET "ownerId" = ${ownerId}, "claimedAt" = ${now}
          WHERE "id" = (
            SELECT gc."id" FROM "GiftCode" gc
            INNER JOIN "GiftBatch" gb ON gb."id" = gc."batchId"
            WHERE gc."ownerId" IS NULL AND gc."claimedAt" IS NULL
              AND gb."expiresAt" > ${now}
            ORDER BY gb."expiresAt" ASC, gb."createdAt" ASC, gc."id" ASC
            LIMIT 1
          )
          AND "ownerId" IS NULL AND "claimedAt" IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM "GiftClaimAudit" recent
            WHERE (recent."claimantIgnKey" = ${claimantIgnKey}
                   OR recent."claimantUserId" = ${ownerId})
              AND recent."claimedAt" > ${cutoff}
          )
        `
        if (updated) {
          const allocated = await tx.giftCode.findFirst({
            where: { ownerId, claimedAt: now },
            select: { id: true, code: true, batch: { select: { title: true, expiresAt: true } } },
          })
          if (!allocated) throw new Error("Gift allocation was not found for audit")
          latest = await tx.giftClaimAudit.create({
            data: {
              giftCodeId: allocated.id,
              code: allocated.code,
              batchTitle: allocated.batch.title,
              batchExpiresAt: allocated.batch.expiresAt,
              claimantIgn,
              claimantIgnKey,
              claimantUserId: ownerId,
              claimedAt: now,
            },
          })
        }
        return latest
      })
    } else {
      claim = await prisma.giftClaimAudit.findFirst({
        where: auditLookup(ownerId, claimantIgnKey),
        orderBy: [{ claimedAt: "desc" }, { id: "desc" }],
      })
    }

    const remaining = await prisma.giftCode.count({
      where: { ownerId: null, claimedAt: null, batch: { expiresAt: { gt: new Date() } } },
    })
    const nextClaimAt = claim?.claimedAt ? new Date(claim.claimedAt.getTime() + GIFT_COOLDOWN_MS) : null
    return res.status(200).json({
      title: "LeighPogo Community Gift",
      claim: responseClaim(claim),
      nextClaimAt,
      canClaim: !nextClaimAt || nextClaimAt <= new Date(),
      remaining,
    })
  } catch (error) {
    console.error("Gift pool claim failed", error)
    return res.status(500).json({ error: "Unable to process gift claim" })
  }
}
