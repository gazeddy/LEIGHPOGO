import bcrypt from "bcryptjs"
import { getServerSession } from "next-auth/next"
import prisma from "../../../lib/prisma"
import { authOptions } from "./[...nextauth]"

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  const session = await getServerSession(req, res, authOptions)
  if (!session?.user?.id) {
    return res.status(401).json({ error: "Unauthorized" })
  }

  const { currentPassword, newPassword } = req.body ?? {}

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Current and new passwords are required" })
  }

  if (typeof newPassword !== "string" || newPassword.length < 8) {
    return res
      .status(400)
      .json({ error: "New password must be at least 8 characters long" })
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } })

  if (!user) {
    return res.status(404).json({ error: "User not found" })
  }

  const isValid = await bcrypt.compare(currentPassword, user.password)

  if (!isValid) {
    return res.status(401).json({ error: "Current password is incorrect" })
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10)

  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashedPassword },
  })

  return res.status(200).json({ success: true })
}
