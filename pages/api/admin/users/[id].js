import bcrypt from "bcryptjs"
import { getServerSession } from "next-auth/next"
import prisma from "../../../../lib/prisma"
import { authOptions } from "../../auth/[...nextauth].js"

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions)

  if (!session || session.user.role !== "admin") {
    return res.status(403).json({ error: "Access denied" })
  }

  const userId = parseInt(req.query.id)

  if (req.method === "PATCH") {
    const { role, password } = req.body

    const updates = {}

    if (role !== undefined) {
      if (!role || !["user", "admin"].includes(role)) {
        return res.status(400).json({ error: "Invalid role" })
      }
      updates.role = role
    }

    if (password !== undefined) {
      if (typeof password !== "string" || password.length < 8) {
        return res
          .status(400)
          .json({ error: "Password must be at least 8 characters" })
      }

      updates.password = await bcrypt.hash(password, 10)
    }

    if (Object.keys(updates).length === 0) {
      return res
        .status(400)
        .json({ error: "No valid updates provided" })
    }

    try {
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: updates,
      })
      res.status(200).json(updatedUser)
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: "Failed to update user" })
    }

  } else if (req.method === "DELETE") {
    // Delete user
    try {
      await prisma.user.delete({ where: { id: userId } });
      res.status(200).json({ message: "User deleted" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to delete user" });
    }
  } else {
    res.status(405).json({ error: "Method not allowed" });
  }
}
