import { getServerSession } from "next-auth/next"
import { authOptions } from "../auth/[...nextauth]"
import prisma from "../../../lib/prisma"
import { PRIVACY_POLICY_VERSION } from "../../../lib/privacyPolicy"

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  const session = await getServerSession(req, res, authOptions)
  const ownerId = Number(session?.user?.id)

  if (!Number.isInteger(ownerId)) {
    return res.status(401).json({ error: "You must be logged in." })
  }

  if (req.body?.acknowledged !== true) {
    return res.status(400).json({
      error: "You must confirm that you have read and understand the Privacy Policy.",
    })
  }

  const acceptance = await prisma.privacyAcceptance.upsert({
    where: {
      ownerId_policyVersion: {
        ownerId,
        policyVersion: PRIVACY_POLICY_VERSION,
      },
    },
    update: { acceptedAt: new Date() },
    create: {
      ownerId,
      policyVersion: PRIVACY_POLICY_VERSION,
    },
  })

  return res.status(200).json({
    accepted: true,
    policyVersion: acceptance.policyVersion,
    acceptedAt: acceptance.acceptedAt,
  })
}
