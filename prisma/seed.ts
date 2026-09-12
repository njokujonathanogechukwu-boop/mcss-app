/**
 * Seeds the first administrator, the hall resources and a starter set of
 * service groups. Safe to run more than once: nothing is duplicated.
 *
 *   npm run db:seed
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? "").toLowerCase().trim();
  const password = process.env.SEED_ADMIN_PASSWORD ?? "";

  if (!email || !password) {
    throw new Error(
      "Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in your environment before seeding.",
    );
  }
  if (password.length < 12) {
    throw new Error("SEED_ADMIN_PASSWORD must be at least 12 characters.");
  }

  const admin = await prisma.user.upsert({
    where: { email },
    update: { role: "SECRETARY", active: true },
    create: {
      email,
      name: "Congregation Secretary",
      role: "SECRETARY",
      passwordHash: await bcrypt.hash(password, 12),
    },
  });
  console.log(`Administrator ready: ${admin.email}`);

  const rooms = [
    { name: "Hall A", description: "Main hall" },
    { name: "Hall B", description: "Second hall" },
  ];
  for (const room of rooms) {
    await prisma.hallResource.upsert({
      where: { name: room.name },
      update: {},
      create: room,
    });
  }
  console.log(`${rooms.length} hall resources ready.`);

  const groups = [
    { number: 1, name: "Maitama" },
    { number: 2, name: "Wuse II" },
    { number: 3, name: "Asokoro" },
    { number: 4, name: "Jabi" },
  ];
  for (const group of groups) {
    await prisma.serviceGroup.upsert({
      where: { number: group.number },
      update: {},
      create: group,
    });
  }
  console.log(`${groups.length} service groups ready.`);

  console.log("\nSeed complete. Sign in, change the password, then import your roster.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
