import prisma from "../../lib/prisma";
import bcrypt from "bcryptjs";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { name, ign, password } = req.body;

  if (!name || !ign || !password) {
    return res.status(400).json({ error: "Missing fields" });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: { name, ign, password: hashedPassword, role: "user" },
    });

    return res.status(201).json({ message: "User created" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}
