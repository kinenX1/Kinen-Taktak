# NovaWear

The online store for **NovaWear**: streetwear marked with the N and the running leopard.

- **Store:** home page with an animated line-up of models, crossing tickers, category tiles, the drop, a colour-switching spotlight, a lookbook, how-to-order steps, about page and newsletter sign-up
- **Shop:** filter by category or pre-order, search, product pages with colour and size pickers, and quick add from the product grid
- **Bag & checkout:** the bag is saved in the browser. Checkout needs an account. Customers can order what's in stock and pre-order what's coming; payment is cash on delivery
- **Accounts:** sign up, sign in, reset password, and "My orders" with a live status timeline (Received → Confirmed → Shipped → Delivered)
- **Admin panel** (`/admin`): add and edit products (T-shirts, pants, hoodies, pyjamas, shorts, jackets), colours, sizes, prices, availability (in stock / pre-order / sold out), photos, and which products are featured on the home page. Manage orders and pre-orders, update statuses with a message to the customer, and see customers and newsletter sign-ups

Products with no photos yet are shown with illustrations in the product's colour, so the shop looks finished from day one. Uploading photos in the admin replaces them.

## Stack

| Layer      | Choice                                                              |
| ---------- | ------------------------------------------------------------------- |
| Framework  | Next.js 16 (App Router, Server Actions), React 19, TypeScript        |
| Styling    | Tailwind CSS v4, with design tokens in `src/app/globals.css`         |
| Motion     | `motion` (Framer Motion), Lenis smooth scroll, CSS keyframes, View Transitions |
| Database   | PostgreSQL through Prisma 6 (product photos are stored in the database too) |
| Auth       | Database sessions, Argon2id password hashing                         |
| Validation | Zod 4 on the server for every action                                 |
| Email      | Nodemailer over SMTP (printed to the server log when not configured) |

---

## 1. Run it on your computer

You need **Node.js 20.9 or newer** ([nodejs.org](https://nodejs.org)) and a **PostgreSQL** database. For the database, either install PostgreSQL locally, or create a free one at [neon.tech](https://neon.tech) and copy its connection string.

Open a terminal and run:

```bash
# 1. Get the code
git clone https://github.com/kinenX1/Kinen-Taktak.git
cd Kinen-Taktak/novawear

# 2. Install packages
npm install

# 3. Create your settings file, then open .env and fill it in
cp .env.example .env
#    DATABASE_URL    → your PostgreSQL connection string
#    ADMIN_EMAIL     → the email you'll use to sign in as admin
#    ADMIN_PASSWORD  → a password of at least 12 characters

# 4. Create the database tables
npm run db:deploy

# 5. Add the sample products and your admin account
npm run db:seed

# 6. Start the site
npm run dev
```

Open **http://localhost:3000**. Sign in at **http://localhost:3000/login** with `ADMIN_EMAIL` and `ADMIN_PASSWORD`, and you land in the admin panel.

> On Windows, use `copy .env.example .env` instead of `cp`.

### Local PostgreSQL in one command (optional)

If you have Docker installed:

```bash
docker run -d --name novawear-db -p 5432:5432 \
  -e POSTGRES_USER=novawear -e POSTGRES_PASSWORD=novawear_dev -e POSTGRES_DB=novawear \
  postgres:16
```

The default `DATABASE_URL` in `.env.example` already matches this.

---

## 2. Put it online and get your own link (Vercel + Neon, free to start)

1. **Database:** create a project at [neon.tech](https://neon.tech). Copy the connection string. Use the **direct** one, the one without `-pooler` in the host name.
2. **Hosting:** sign in at [vercel.com](https://vercel.com) with GitHub, click **Add New → Project** and import `Kinen-Taktak`.
3. In the import screen, set **Root Directory** to `novawear`.
4. Under **Environment Variables**, add:
   - `DATABASE_URL`: the Neon connection string
   - `NEXT_PUBLIC_SITE_URL`: your site address, e.g. `https://novawear.vercel.app` (you can change it later)
   - `NEXT_PUBLIC_CURRENCY`: e.g. `EUR`, `TND`, `MAD`, `DZD` or `USD`
5. Click **Deploy**. Vercel runs `npm run vercel-build`, which creates the database tables and builds the site. You get a link like `https://novawear.vercel.app`.
6. Create your admin account and the sample products. On your computer, set `DATABASE_URL` in `.env` to the same Neon string, then run:

   ```bash
   npm run db:seed
   ```

7. Open your link, go to `/login`, sign in as admin and start adding your real products.

**Your own domain** (like `novawear.com`): buy it from any registrar, then in Vercel open **Project → Settings → Domains** and follow the steps. Update `NEXT_PUBLIC_SITE_URL` to match.

**Emails** (order confirmations, password resets): add the `SMTP_*` variables from `.env.example` in Vercel. Any SMTP provider works (Gmail app password, Brevo, Resend, Mailgun…). Set `ADMIN_NOTIFICATION_EMAIL` to receive an email for every new order. Without SMTP everything still works; emails are only printed to the server log.

---

## 3. Running the shop (admin guide)

- **Add a product:** Admin → Products → **Add a product**. Fill in the name, category, price, availability, sizes and colours, then **Create product**. On the next screen add photos (drag them in). Photos are resized automatically. The first photo is the cover, and the second shows when customers hover.
- **Pre-orders:** set availability to **Pre-order** and add a short note like "Ships mid-November". Customers can order it and see it marked as a pre-order everywhere.
- **Home page:** click the ★ on a product to feature it in "The drop" on the home page. The first featured hoodie becomes the big spotlight section.
- **Hide a product:** switch off **In shop**. Delete it from the product page; past orders keep their details.
- **Orders:** Admin → Orders shows everything, with filters for pre-orders and each status. Open an order, call the customer (the phone number is a tap-to-call link), then set **Confirmed**, **Shipped** and **Delivered**. You can add a message; it's shown on the customer's order page and emailed to them if SMTP is set up.
- **Another admin:** have them create an account, then run `npm run make-admin -- their@email.com`.

## Configuration

| Where                      | What                                                                 |
| -------------------------- | -------------------------------------------------------------------- |
| `.env`                     | Database, site URL, currency, email, first admin                     |
| `src/config/site.ts`       | Contact email, phone, social links, hashtag, announcement bar messages |
| `src/config/shop.ts`       | Categories, sizes, colour presets, delivery fee (`null` = confirmed by phone) |
| `src/app/globals.css`      | Brand colours and fonts                                              |
| `src/components/brand/`    | The N + leopard logo, the illustrated models and the garment drawings |

The 8 seeded products and their prices are **samples**. Edit or delete them in the admin.

## Scripts

| Script                          | Purpose                                         |
| ------------------------------- | ----------------------------------------------- |
| `npm run dev`                   | Development server at http://localhost:3000     |
| `npm run build` / `npm start`   | Production build and server                     |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript                        |
| `npm run db:migrate`            | Create a new migration after editing `prisma/schema.prisma` |
| `npm run db:deploy`             | Apply migrations (setup and production)         |
| `npm run db:seed`               | Add sample products and the admin; safe to re-run |
| `npm run db:studio`             | Browse the database in your browser             |
| `npm run make-admin -- <email>` | Make an existing account an administrator        |

## How it's built

```
prisma/                 schema, migrations, seed
src/
  proxy.ts              redirects signed-out visitors away from /account, /checkout and /admin
  actions/              server actions: auth, orders and newsletter, admin
  app/
    (store)/            home, shop, product, about, bag, checkout, account
    (auth)/             sign in, create account, forgot / reset password
    admin/              admin panel
    api/images/[id]/    serves product photos from the database
  components/
    brand/              logo, leopard, illustrated models, garments, motion marks
    home/ shop/ cart/ account/ admin/ auth/ layout/ motion/ ui/
  config/               site and shop settings
  lib/                  auth, data queries, validation, image checks
```

**Data model:** `User` (role `CUSTOMER` or `ADMIN`) → `Order` (reference like `NW-7K3Q9P`, delivery details, totals) → `OrderItem` (a snapshot of the product, colour, size, price and whether it was a pre-order) and `OrderEvent` (status history shown to the customer). `Product` has `ProductColor` and `ProductImage` rows. `Subscriber` holds newsletter emails.

### Security

- Passwords are hashed with Argon2id. Sessions are random tokens; only their SHA-256 hash is stored, in an httpOnly, `SameSite=Lax` cookie that is `Secure` in production.
- Every admin page and action re-checks the admin role on the server. Customer orders are always looked up by the signed-in user, so other people's orders return 404.
- Checkout never trusts the browser: prices, colours, sizes and availability are re-read from the database when the order is placed.
- Photo uploads are checked by file signature (JPG, PNG and WebP only, 3 MB max) and served with `nosniff` and a sandboxing CSP.
- Sign-in, sign-up, password reset, orders and newsletter sign-up are rate limited. The limiter is in-memory, so use Redis or Upstash if you run several servers.

### Motion and accessibility

- All motion respects the "reduce motion" setting: Motion uses `reducedMotion="user"`, Lenis turns off, and CSS animations stop.
- Semantic landmarks, a skip link, visible focus styles, labelled form controls with linked error messages, a focus-trapped mobile menu, and touch targets of at least 44 px.

### Next steps you may want

- **Online card payments:** add a provider (Stripe, PayPal, or a local gateway) to the checkout. Orders currently use cash on delivery.
- **Stock counts per size:** availability is currently set per product.
- **Real photos:** replace the illustrations by uploading your own shoots in the admin.
