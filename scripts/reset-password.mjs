import bcrypt from "bcryptjs"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  const ign = "IGN GOES HERE"            // change to your user's IGN
  const newPassword = "newpassword123" // set password here

  const hash = await bcrypt.hash(newPassword, 10)

  // Upsert ensures no P2025 error
  await prisma.user.upsert({
    where: { ign },
    update: { password: hash },
    create: { name: ign, ign, password: hash, role: "user" },
  })

  console.log("✅ Password reset complete for", ign)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
