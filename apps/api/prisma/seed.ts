import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Create demo user if not exists
  const demoUser = await prisma.user.findUnique({
    where: { email: 'demo@envault.local' }
  });

  if (!demoUser) {
    const passwordHash = await bcrypt.hash('demo123', 10);
    await prisma.user.create({
      data: {
        id: 'demo-user-id',
        email: 'demo@envault.local',
        passwordHash,
        name: 'Demo User'
      }
    });
    console.log('Demo user created');
  } else {
    console.log('Demo user already exists');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
