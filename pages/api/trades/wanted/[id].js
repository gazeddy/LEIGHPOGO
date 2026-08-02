import { getServerSession } from "next-auth/next"
import { authOptions } from "../../auth/[...nextauth]"
import prisma from "../../../../lib/prisma"
import { getAuthenticatedUser } from "../../../../lib/tradeServer"

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions)

  if (!session) {
    return res.status(401).json({ error: "You must be logged in." })
  }

  const currentUser = await getAuthenticatedUser(session)

  if (!currentUser) {
    return res.status(401).json({ error: "Your account could not be found." })
  }

  if (req.method !== "DELETE") {
    res.setHeader("Allow", "DELETE")
    return res.status(405).json({ error: "Method not allowed" })
  }

  const id = Number(req.query.id)

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid wanted trade ID." })
  }

  const entry = await prisma.wantedTrade.findUnique({
    where: { id },
    select: { id: true, ownerId: true },
  })

  if (!entry) {
    return res.status(404).json({ error: "Wanted trade not found." })
  }

  if (entry.ownerId !== currentUser.id && currentUser.role !== "admin") {
    return res.status(403).json({ error: "You can only remove your own wanted trades." })
  }

  await prisma.wantedTrade.delete({ where: { id } })
  return res.status(200).json({ deleted: true })
}
