/**
 * Promote an existing account to administrator.
 *   npm run make-admin -- someone@example.com
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const email = process.argv[2]?.trim().toLowerCase();

if (!email) {
  console.error("Usage: npm run make-admin -- <email>");
  process.exit(1);
}

db.user
  .update({ where: { email }, data: { role: "ADMIN" } })
  .then((u) => console.log(`✓ ${u.email} is now an administrator`))
  .catch(() => {
    console.error(`No account found for ${email}`);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
