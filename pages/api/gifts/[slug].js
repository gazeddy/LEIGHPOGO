import { getServerSession } from "next-auth/next"
import prisma from "../../../lib/prisma"
import { authOptions } from "../auth/[...nextauth]"

export default async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) return res.status(405).json({ error: "Method not allowed" })
  const session = await getServerSession(req, res, authOptions)
  if (!session?.user?.id) return res.status(401).json({ error: "Sign in to claim this gift" })
  if (!session.user.privacyPolicyAccepted) return res.status(403).json({ error: "Please accept the current privacy policy first" })
  const slug = String(req.query.slug || "")
  const batch = await prisma.giftBatch.findUnique({
    where: { slug },
    select: { id: true, title: true, expiresAt: true },
  })
  if (!batch) return res.status(404).json({ error: "Gift not found" })
  const ownerId = Number(session.user.id)
  const expired = batch.expiresAt <= new Date()
  const existing = async () => prisma.giftCode.findFirst({
    where: { batchId: batch.id, ownerId },
    select: { code: true, claimedAt: true },
  })
  const claim = await existing()
  if (req.method === "GET" || expired || claim) {
    const remaining = await prisma.giftCode.count({ where: { batchId: batch.id, ownerId: null } })
    return res.status(200).json({ title: batch.title, expiresAt: batch.expiresAt, expired, remaining, claim })
  }

  // Conditional write ensures no single code is allocated twice, even if two claims overlap.
  // Unique(batchId, ownerId) ensures an account cannot obtain a second code.
  for (let attempt = 0; attempt < 8; attempt++) {
    const prior = await existing()
    if (prior) return res.status(200).json({ title: batch.title, expiresAt: batch.expiresAt, claim: prior })
    const available = await prisma.giftCode.findFirst({
      where: { batchId: batch.id, ownerId: null },
      orderBy: { id: "asc" }, select: { id: true },
    })
    if (!available) return res.status(409).json({ error: "All codes have been claimed" })
    try {
      const change = await prisma.giftCode.updateMany({
        where: { id: available.id, batchId: batch.id, ownerId: null },
        data: { ownerId, claimedAt: new Date() },
      })
      if (change.count === 1) {
        const assigned = await existing()
        return res.status(200).json({ title: batch.title, expiresAt: batch.expiresAt, claim: assigned })
      }
    } catch (error) {
      // Competing requests from the same user can hit the unique constraint.
      if (error.code !== "P2002") throw error
      const assigned = await existing()
      if (assigned) return res.status(200).json({ title: batch.title, expiresAt: batch.expiresAt, claim: assigned })
    }
  }
  return res.status(503).json({ error: "Claim is busy; please retry" })
}
