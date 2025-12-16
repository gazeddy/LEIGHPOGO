import prisma from "../../../lib/prisma"
import bcrypt from "bcryptjs"

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  const { name, ign, password } = req.body

  // ✅ Only IGN + password are required
  if (!ign || !password) {
    return res.status(400).json({ error: "IGN and password are required" })
  }

  if (password.length < 8) {
    return res
      .status(400)
      .json({ error: "Password must be at least 8 characters" })
  }

  try {
    const existingUser = await prisma.user.findUnique({
      where: { ign },
    })

    if (existingUser) {
      return res.status(409).json({ error: "IGN already registered" })
    }

    const hashedPassword = await bcrypt.hash(password, 10)

    await prisma.user.create({
      data: {
        // ✅ Default name to IGN if not provided
        name: name && name.trim() ? name.trim() : ign,
        ign,
        password: hashedPassword,
        role: "user",
      },
    })

    return res.status(201).json({ success: true })
  } catch (err) {
    console.error("REGISTER ERROR:", err)
    return res.status(500).json({ error: "Internal server error" })
  }
}
