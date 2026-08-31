import bcrypt from "bcryptjs"
import { getServerSession } from "next-auth/next"
import { authOptions } from "./auth/[...nextauth]"
import prisma from "../../lib/prisma"
import { canonicalFriendCode } from "../../lib/friendCode"
import { removeStoredPokedexImport } from "../../lib/pokedexImportQueue"

const VALID_TEAMS = ["INSTINCT", "MYSTIC", "VALOR"]
const DELETE_CONFIRMATION = "DELETE"

function expireAuthCookies(res) {
  res.setHeader("Set-Cookie", [
    "next-auth.session-token=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax",
    "__Secure-next-auth.session-token=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax",
    "next-auth.callback-url=; Max-Age=0; Path=/; SameSite=Lax",
    "__Secure-next-auth.callback-url=; Max-Age=0; Path=/; Secure; SameSite=Lax",
  ])
}

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions)
  const ownerId = Number(session?.user?.id)

  if (!Number.isInteger(ownerId)) {
    return res.status(401).json({ error: "You must be logged in." })
  }

  if (req.method === "PUT") {
    const { friendCode, team } = req.body

    if (team && !VALID_TEAMS.includes(String(team).toUpperCase())) {
      return res.status(400).json({ error: "Invalid team selection" })
    }

    const hasFriendCode = String(friendCode ?? "").trim().length > 0
    const normalizedFriendCode = hasFriendCode
      ? canonicalFriendCode(friendCode)
      : null

    if (hasFriendCode && !normalizedFriendCode) {
      return res.status(400).json({
        error: "Friend code must contain exactly 12 digits.",
      })
    }

    try {
      const normalizedTeam = String(team || "MYSTIC").toUpperCase()
      const latestEntry = await prisma.entry.findFirst({
        where: { ownerId },
        orderBy: { createdAt: "desc" },
      })

      const updatedEntry = latestEntry
        ? await prisma.entry.update({
            where: { id: latestEntry.id },
            data: {
              code:
                normalizedFriendCode ||
                canonicalFriendCode(latestEntry.code) ||
                "",
              team: normalizedTeam,
            },
          })
        : await prisma.entry.create({
            data: {
              trainerName: session.user.ign,
              code: normalizedFriendCode || "",
              team: normalizedTeam,
              ownerId,
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

  if (req.method === "DELETE") {
    const confirmation = String(req.body?.confirmation || "")
    const password = String(req.body?.password || "")

    if (confirmation !== DELETE_CONFIRMATION || !password) {
      return res.status(400).json({
        error: `Enter your current password and type ${DELETE_CONFIRMATION} to delete your account.`,
      })
    }

    try {
      const user = await prisma.user.findUnique({
        where: { id: ownerId },
        select: { id: true, password: true },
      })

      if (!user) {
        expireAuthCookies(res)
        return res.status(401).json({ error: "Account no longer exists." })
      }

      const validPassword = await bcrypt.compare(password, user.password)
      if (!validPassword) {
        return res.status(403).json({ error: "Current password is incorrect." })
      }

      const importJobs = await prisma.pokedexImportJob.findMany({
        where: { ownerId },
        select: { id: true },
      })

      // Remove private screenshot files before removing their database records.
      // If filesystem cleanup fails, leave the account intact so deletion can be retried safely.
      for (const job of importJobs) {
        await removeStoredPokedexImport(job.id)
      }

      await prisma.$transaction(async (tx) => {
        await tx.friendCodeGrabNotification.deleteMany({
          where: { OR: [{ ownerId }, { copiedById: ownerId }] },
        })
        await tx.tradeNotification.deleteMany({ where: { ownerId } })
        await tx.tradeListing.deleteMany({ where: { ownerId } })
        await tx.wantedTrade.deleteMany({ where: { ownerId } })
        await tx.pushSubscription.deleteMany({ where: { ownerId } })
        await tx.userTickerPreference.deleteMany({ where: { ownerId } })
        await tx.pokedexQueueAlert.deleteMany({ where: { ownerId } })
        await tx.pokedexImportJob.deleteMany({ where: { ownerId } })
        await tx.pokedexEntry.deleteMany({ where: { ownerId } })
        await tx.searchString.deleteMany({ where: { ownerId } })
        await tx.entry.deleteMany({ where: { ownerId } })
        await tx.usageEvent.deleteMany({ where: { ownerId } })
        await tx.privacyAcceptance.deleteMany({ where: { ownerId } })
        await tx.user.delete({ where: { id: ownerId } })
        await tx.accountRevocation.upsert({
          where: { userId: ownerId },
          update: { revokedAt: new Date() },
          create: { userId: ownerId },
        })
      })

      expireAuthCookies(res)
      return res.status(200).json({ deleted: true })
    } catch (error) {
      console.error("Failed to delete account", error)
      return res.status(500).json({ error: "Unable to delete account. Please try again." })
    }
  }

  return res.status(405).json({ error: "Method not allowed" })
}
