const bcrypt = require('bcrypt');
const prisma = require('../lib/prisma');

async function main() {
  const hashedAdmin = await bcrypt.hash('adminpass', 10);
  await prisma.user.upsert({
    where: { ign: 'AdminTrainer' },
    update: {},
    create: { ign: 'AdminTrainer', name: 'Admin', password: hashedAdmin, role: 'admin' }
  });

  const hashedUser = await bcrypt.hash('userpass', 10);
  await prisma.user.upsert({
    where: { ign: 'AshKetchum' },
    update: {},
    create: { ign: 'AshKetchum', name: 'Ash', password: hashedUser, role: 'user' }
  });

  console.log('Seeded test users:');
  console.log('- AdminTrainer (password: adminpass) - Admin role');
  console.log('- AshKetchum (password: userpass) - User role');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
