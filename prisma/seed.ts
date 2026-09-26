/**
 * Seeds services, demo portfolio projects and the initial administrator.
 * Safe to run repeatedly — existing rows are updated, not duplicated.
 *   npm run db:seed
 */
import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";
import { serviceSeeds } from "../src/content/services";
import { portfolioSeeds } from "../src/content/portfolio";

const db = new PrismaClient();

async function main() {
  for (const [i, s] of serviceSeeds.entries()) {
    await db.service.upsert({
      where: { slug: s.slug },
      create: { ...s, sortOrder: i * 10 },
      update: {},
    });
  }
  console.log(`✓ ${serviceSeeds.length} services`);

  for (const [i, p] of portfolioSeeds.entries()) {
    await db.portfolioProject.upsert({
      where: { slug: p.slug },
      create: { ...p, isDemo: true, sortOrder: i * 10 },
      update: {},
    });
  }
  console.log(`✓ ${portfolioSeeds.length} demo portfolio projects`);

  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (email && password) {
    if (password.length < 12) throw new Error("ADMIN_PASSWORD must be at least 12 characters.");
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      await db.user.update({ where: { email }, data: { role: "ADMIN" } });
      console.log(`✓ ${email} is an administrator (password unchanged)`);
    } else {
      await db.user.create({
        data: {
          email,
          name: process.env.ADMIN_NAME || "MovEra Admin",
          role: "ADMIN",
          passwordHash: await hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 }),
        },
      });
      console.log(`✓ Created administrator ${email}`);
    }
  } else {
    console.log("• ADMIN_EMAIL / ADMIN_PASSWORD not set — skipped admin creation");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
