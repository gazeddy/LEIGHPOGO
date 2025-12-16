import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

async function main() {
  const ign = "Angryspanner"
  const passwordPlain = "test" // pick something

  const password = await bcrypt.hash(passwordPlain, 10)

  await prisma.user.upsert({
    where: { ign },
    update: { password },
    create: {
      name: "Angryspanner",
      ign,
      password,
      role: "user",
    },
  })

  console.log("✅ Seeded default user", ign)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
