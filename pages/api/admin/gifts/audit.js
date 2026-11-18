import { getServerSession } from "next-auth/next"
import prisma from "../../../../lib/prisma"
import { authOptions } from "../../auth/[...nextauth]"

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" })
  const session = await getServerSession(req, res, authOptions)
  if (session?.user?.role !== "admin") return res.status(403).json({ error: "Admin only" })
  try {
    const records = await prisma.giftClaimAudit.findMany({
      orderBy: [{ claimedAt: "desc" }, { id: "desc" }],
      take: 1000,
      select: {
        id: true, code: true, claimantIgn: true, claimantUserId: true,
        batchTitle: true, claimedAt: true,
      },
    })
    res.setHeader("Cache-Control", "private, no-store")
    return res.status(200).json(records)
  } catch (error) {
    console.error("Gift claim audit fetch failed", error)
    return res.status(500).json({ error: "Unable to retrieve claim audit" })
  }
}
