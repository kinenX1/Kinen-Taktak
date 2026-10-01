/**
 * Seeds the sample Drop 01 catalogue and the first administrator.
 * Safe to run repeatedly — existing products are left as they are.
 *   npm run db:seed
 *
 * The products and prices below are SAMPLES so the shop is not empty on day
 * one. Edit or delete them from /admin/products.
 */
import { PrismaClient, type Availability, type Category } from "@prisma/client";
import { hash } from "@node-rs/argon2";

const db = new PrismaClient();

const C = {
  ink: { name: "Ink", hex: "#151514" },
  bone: { name: "Bone", hex: "#ECE8DF" },
  leopard: { name: "Leopard", hex: "#C9892E" },
  olive: { name: "Olive", hex: "#5D6047" },
  choc: { name: "Chocolate", hex: "#4B3427" },
  grey: { name: "Grey", hex: "#9C9B97" },
  sand: { name: "Sand", hex: "#B9A487" },
  navy: { name: "Navy", hex: "#1F2738" },
};

type Seed = {
  slug: string;
  name: string;
  category: Category;
  price: number;
  availability: Availability;
  preorderNote?: string;
  featured?: boolean;
  colors: { name: string; hex: string }[];
  sizes: string[];
  description: string;
  details: string[];
};

const all = ["XS", "S", "M", "L", "XL", "XXL"];

const products: Seed[] = [
  {
    slug: "prowl-hoodie",
    name: "Prowl Hoodie",
    category: "HOODIE",
    price: 6900,
    availability: "PRE_ORDER",
    preorderNote: "Ships when Drop 01 lands",
    featured: true,
    colors: [C.ink, C.leopard, C.olive, C.bone],
    sizes: all,
    description:
      "Heavyweight hoodie with a lined hood, a kangaroo pocket, the N patch on the chest and the running leopard printed across the back.",
    details: ["N patch on the chest", "Running-leopard print across the back", "Lined hood with drawcords", "Kangaroo pocket", "Relaxed fit"],
  },
  {
    slug: "n-logo-heavy-tee",
    name: "N-Logo Heavy Tee",
    category: "TSHIRT",
    price: 3200,
    availability: "PRE_ORDER",
    preorderNote: "Ships when Drop 01 lands",
    featured: true,
    colors: [C.bone, C.ink, C.leopard],
    sizes: all,
    description: "A boxy, heavyweight tee with the NovaWear sign on the chest. The one you'll wear every day.",
    details: ["Boxy, dropped-shoulder fit", "N sign on the chest", "Ribbed crew neck"],
  },
  {
    slug: "leopard-run-tee",
    name: "Leopard Run Tee",
    category: "TSHIRT",
    price: 3000,
    availability: "IN_STOCK",
    featured: true,
    colors: [C.ink, C.olive, C.bone],
    sizes: ["S", "M", "L", "XL"],
    description: "Oversized tee with the leopard running across the back and a small N on the front.",
    details: ["Oversized fit", "Leopard print on the back", "Small N on the front"],
  },
  {
    slug: "prowl-track-pant",
    name: "Prowl Track Pant",
    category: "PANTS",
    price: 4900,
    availability: "IN_STOCK",
    featured: true,
    colors: [C.ink, C.grey],
    sizes: ["S", "M", "L", "XL", "XXL"],
    description: "Straight-leg track pant with an elastic waist, drawcords and the N on the thigh.",
    details: ["Elastic waist with drawcords", "Straight leg", "Side pockets", "N on the left thigh"],
  },
  {
    slug: "cargo-pant-01",
    name: "Cargo Pant 01",
    category: "PANTS",
    price: 5900,
    availability: "PRE_ORDER",
    preorderNote: "Ships when Drop 01 lands",
    featured: true,
    colors: [C.olive, C.sand, C.ink],
    sizes: ["S", "M", "L", "XL"],
    description: "Relaxed cargo pant with deep side pockets and an adjustable hem.",
    details: ["Relaxed fit", "Two cargo pockets", "Adjustable hem"],
  },
  {
    slug: "night-prowl-pyjama-set",
    name: "Night Prowl Pyjama Set",
    category: "PYJAMA",
    price: 5500,
    availability: "PRE_ORDER",
    preorderNote: "Ships when Drop 01 lands",
    featured: true,
    colors: [C.choc, C.ink],
    sizes: ["XS", "S", "M", "L", "XL"],
    description: "Button-up shirt and matching pants with contrast piping and a tiny leopard on the pocket.",
    details: ["Shirt and pants set", "Contrast piping", "Leopard on the chest pocket"],
  },
  {
    slug: "rosette-lounge-pyjama",
    name: "Rosette Lounge Pyjama",
    category: "PYJAMA",
    price: 4900,
    availability: "IN_STOCK",
    featured: true,
    colors: [C.bone, C.navy],
    sizes: ["XS", "S", "M", "L"],
    description: "Soft lounge set with an all-over rosette print, made for slow mornings.",
    details: ["Shirt and pants set", "All-over rosette print", "Elastic waist"],
  },
  {
    slug: "n-zip-hoodie",
    name: "N Zip Hoodie",
    category: "HOODIE",
    price: 7200,
    availability: "IN_STOCK",
    featured: true,
    colors: [C.choc, C.grey],
    sizes: ["S", "M", "L", "XL"],
    description: "Full-zip hoodie with a tonal N on the chest and ribbed cuffs.",
    details: ["Full zip", "Tonal N on the chest", "Ribbed cuffs and hem"],
  },
];

async function main() {
  for (const [i, p] of products.entries()) {
    const { colors, details, featured, ...rest } = p;
    await db.product.upsert({
      where: { slug: p.slug },
      create: {
        ...rest,
        featured: featured ?? false,
        details: details.join("\n"),
        sortOrder: i * 10,
        colors: { create: colors.map((c, position) => ({ ...c, position })) },
      },
      update: {},
    });
  }
  console.log(`✓ ${products.length} sample products`);

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
          name: process.env.ADMIN_NAME || "NovaWear Admin",
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
