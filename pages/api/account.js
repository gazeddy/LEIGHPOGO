import { getServerSession } from "next-auth/next"
import { authOptions } from "./auth/[...nextauth]"
import prisma from "../../lib/prisma"

const VALID_TEAMS = ["INSTINCT", "MYSTIC", "VALOR"]

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions)

  if (!session) {
    return res.status(401).json({ error: "You must be logged in." })
  }

  if (req.method === "GET") {
    const profile = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { ign: true, team: true, friendCode: true },
    })

    return res.status(200).json(profile)
  }

  if (req.method === "PUT") {
    const { friendCode, team } = req.body

    if (team && !VALID_TEAMS.includes(String(team).toUpperCase())) {
      return res.status(400).json({ error: "Invalid team selection" })
    }

    try {
      const normalizedTeam = (team || "MYSTIC").toUpperCase()

      const updatedUser = await prisma.user.update({
        where: { id: session.user.id },
        data: { friendCode: friendCode || null, team: normalizedTeam },
        select: { id: true, ign: true, team: true, friendCode: true },
      })

      if (friendCode) {
        const latestEntry = await prisma.entry.findFirst({
          where: { ownerId: session.user.id },
          orderBy: { createdAt: "desc" },
        })

        if (latestEntry) {
          await prisma.entry.update({
            where: { id: latestEntry.id },
            data: { code: friendCode },
          })
        } else {
          await prisma.entry.create({
            data: {
              trainerName: updatedUser.ign,
              code: friendCode,
              ownerId: session.user.id,
            },
          })
        }
      }

      return res.status(200).json(updatedUser)
    } catch (error) {
      console.error("Failed to update profile", error)
      return res.status(500).json({ error: "Unable to update account" })
    }
  }

  return res.status(405).json({ error: "Method not allowed" })
}
