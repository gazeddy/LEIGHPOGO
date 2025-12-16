import prisma from "../../../lib/prisma"
import bcrypt from "bcryptjs"

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  const { name, ign, password } = req.body

  if (!name || !ign || !password) {
    return res.status(400).json({ error: "Missing required fields" })
  }

  if (password.length < 8) {
    return res
      .status(400)
      .json({ error: "Password must be at least 8 characters" })
  }

  try {
    // Check if IGN already exists
    const existingUser = await prisma.user.findUnique({
      where: { ign },
    })

    if (existingUser) {
      return res.status(409).json({ error: "IGN already registered" })
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10)

    // Create user
    await prisma.user.create({
      data: {
        name,
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
