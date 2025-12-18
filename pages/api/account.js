import { getServerSession } from "next-auth/next"
import { authOptions } from "./auth/[...nextauth]"
import prisma from "../../lib/prisma"

const VALID_TEAMS = ["INSTINCT", "MYSTIC", "VALOR"]

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions)

  if (!session) {
    return res.status(401).json({ error: "You must be logged in." })
  }

  if (req.method === "PUT") {
    const { friendCode, team } = req.body

    if (team && !VALID_TEAMS.includes(String(team).toUpperCase())) {
      return res.status(400).json({ error: "Invalid team selection" })
    }

    try {
      const normalizedTeam = (team || "MYSTIC").toUpperCase()
      const latestEntry = await prisma.entry.findFirst({
        where: { ownerId: session.user.id },
        orderBy: { createdAt: "desc" },
      })

      const updatedEntry = latestEntry
        ? await prisma.entry.update({
            where: { id: latestEntry.id },
            data: { code: friendCode || latestEntry.code, team: normalizedTeam },
          })
        : await prisma.entry.create({
            data: {
              trainerName: session.user.ign,
              code: friendCode || "",
              team: normalizedTeam,
              ownerId: session.user.id,
            },
          })

      return res.status(200).json({
        friendCode: updatedEntry.code,
        team: updatedEntry.team,
        trainerName: updatedEntry.trainerName,
      })
    } catch (error) {
      console.error("Failed to update profile", error)
      return res.status(500).json({ error: "Unable to update account" })
    }
  }

  return res.status(405).json({ error: "Method not allowed" })
}
