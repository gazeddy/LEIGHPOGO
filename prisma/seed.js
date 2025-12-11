const bcrypt = require('bcrypt');
const prisma = require('../lib/prisma');

async function main() {
  const hashedAdmin = await bcrypt.hash('adminpass', 10);
  await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: { email: 'admin@example.com', name: 'Admin', password: hashedAdmin, role: 'admin' }
  });

  const hashedUser = await bcrypt.hash('userpass', 10);
  await prisma.user.upsert({
    where: { email: 'ash@example.com' },
    update: {},
    create: { email: 'ash@example.com', name: 'Ash', password: hashedUser, role: 'user' }
  });

  console.log('Seeded admin@example.com (adminpass) and ash@example.com (userpass)');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => process.exit(0));
