# MovEra

The website and client platform for **MovEra**, a digital product studio. It has three parts:

- **Marketing site:** home, work (portfolio and case studies), services, about, contact and legal pages
- **Client portal:** accounts, a multi-step project brief with file uploads and drafts, and a dashboard with request status tracking
- **Admin panel:** incoming requests (search, filter, status changes, internal notes), clients, contact messages, and portfolio and services content

## Stack

| Layer      | Choice                                                                  |
| ---------- | ----------------------------------------------------------------------- |
| Framework  | Next.js 16 (App Router, Server Actions, Turbopack), React 19, TypeScript |
| Styling    | Tailwind CSS v4, with design tokens in `src/app/globals.css`             |
| Motion     | `motion` (Framer Motion), Lenis smooth scroll, a custom canvas flow field, React `<ViewTransition>` |
| Database   | PostgreSQL through Prisma 6                                              |
| Auth       | Custom database sessions and Argon2id password hashing (`@node-rs/argon2`) |
| Validation | Zod 4, run on the server for every action                                |
| Email      | Nodemailer over SMTP (logged to the console when not configured)         |

## Getting started

Requirements: Node 20.9 or later, and PostgreSQL 14 or later.

```bash
npm install
cp .env.example .env          # then edit DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD
npm run db:migrate            # create the schema
npm run db:seed               # services, demo portfolio, initial admin
npm run dev                   # http://localhost:3000
```

Sign in at `/login` with `ADMIN_EMAIL` and `ADMIN_PASSWORD` to open `/admin`.

### Scripts

| Script                           | Purpose                                             |
| -------------------------------- | --------------------------------------------------- |
| `npm run dev`                    | Development server                                  |
| `npm run build` / `npm start`    | Production build and server                         |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript                             |
| `npm run db:migrate`             | Create and apply a migration (development)          |
| `npm run db:deploy`              | Apply migrations (production)                       |
| `npm run db:seed`                | Seed or refresh content; safe to re-run             |
| `npm run make-admin -- <email>`  | Promote an existing account to administrator        |

## Configuration

All secrets live in environment variables. See `.env.example` for the full list.

| Variable                   | Required | Notes                                                                 |
| -------------------------- | -------- | --------------------------------------------------------------------- |
| `DATABASE_URL`             | yes      | PostgreSQL connection string                                          |
| `NEXT_PUBLIC_SITE_URL`     | yes      | Used for metadata, the sitemap and links in emails                    |
| `UPLOAD_DIR`               | no       | Where attachments are stored (default `./storage/uploads`, outside `public/`) |
| `SMTP_*`, `EMAIL_FROM`     | no       | Without `SMTP_HOST`, emails are printed to the server log             |
| `ADMIN_NOTIFICATION_EMAIL` | no       | Receives notifications for new requests and messages                  |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | seed only | Creates the first administrator               |

Content and options that are meant to be edited:

- `src/config/site.ts`: navigation, contact email, social links, and an optional response-time promise shown after a brief is submitted (off by default)
- `src/config/project-brief.ts`: project types, budget ranges, timelines, statuses and upload limits
- `src/content/*`: seed content for services and the demo portfolio, plus the process, values and pillars copy
- `/admin/portfolio` and `/admin/services`: manage published content without code changes

### Demo portfolio

The six seeded projects (Tavola, Ledgerline, Atelier Nord, Halden Architects, Fleetwise and Pulse Care) are **concept projects**, not real clients. They are stored with `isDemo = true` and labelled "Concept" on the site, and they make no claims about real-world results. Replace or unpublish them from `/admin/portfolio`. Set a `coverImage` to swap a generated cover for real imagery.

## Architecture

```
prisma/                 schema, migrations, seed
src/
  proxy.ts              optimistic redirect for /dashboard and /admin (no session cookie → /login)
  actions/              server actions: auth, project-request, contact, account, admin
  app/
    (site)/             marketing pages and /start-project (navbar, footer, smooth scroll, page transitions)
    (auth)/             login, register, forgot/reset password
    dashboard/          client portal
    admin/              admin panel
    api/files/[id]/     authorised attachment downloads
  components/           ui primitives, motion, layout, home, work, brief, dashboard, admin, visuals
  config/               editable site and brief configuration
  content/              seed copy
  lib/
    auth/               password hashing, sessions, data-access guards (requireUser/requireAdmin)
    data/               queries: public content, client-scoped, admin-only
    validation/         Zod schemas shared by actions
    uploads.ts          signature-verified file storage
```

**Data model:** `User` (role `CLIENT` or `ADMIN`) → `ProjectRequest` (status lifecycle, human-readable `MV-XXXXXX` reference) → `ProjectFile` and `ProjectUpdate` (status changes and notes, each visible to the client or internal). Marketing content lives in `PortfolioProject` and `Service`, and contact-form submissions in `ContactMessage`. A request becomes a "project" once its status reaches `IN_PROGRESS`.

### Security

- Passwords are hashed with Argon2id. Login takes similar time whether or not the email exists, and password reset never reveals whether an account exists.
- Sessions are random 160-bit tokens. Only their SHA-256 hash is stored, and the cookie is httpOnly, `SameSite=Lax` and `Secure` in production. Sessions last 30 days with sliding renewal. A password change or reset signs out other sessions.
- Authorization is enforced on the server in `src/lib/auth/dal.ts` and in every query. Client queries are always scoped by `userId`, so another user's request returns a 404. Every admin action re-checks the role.
- Every action validates input with Zod. React escapes all user content; nothing is rendered as raw HTML. Links submitted as inspiration are restricted to `http(s)`.
- Uploads use an allow-list verified by file signature (magic bytes), not by the client's MIME type. Files get randomised names, are stored outside `public/`, and are served only to their owner or an admin, with `nosniff` and a sandboxing CSP. SVG is not accepted.
- An in-memory rate limiter covers login, registration, password reset, briefs and contact messages. Swap it for Redis when running several instances. The contact form also has a honeypot field.
- Security headers include HSTS in production, `X-Frame-Options`, `frame-ancestors`, `Referrer-Policy` and `Permissions-Policy`. Server Actions include Next.js's built-in origin check against CSRF.

### Motion and accessibility

- All motion respects `prefers-reduced-motion`. Motion runs with `reducedMotion="user"`, Lenis is disabled, the canvas renders one still frame, and CSS animations are neutralised.
- The hero canvas caps its pixel ratio, scales particle count to screen area, and pauses when off-screen or when the tab is hidden.
- The site uses semantic landmarks and has a skip link, visible focus styles and labelled form controls, with errors linked via `aria-describedby`. The mobile menu is a focus-trapped dialog, and the primary mobile controls have touch targets of at least 44 px.
- Content stays visible without JavaScript (see the `<noscript>` rule in the root layout).

## Deployment notes

- Run `npm run db:deploy` on release, then `npm run build`. The build reads published content from the database to pre-render marketing pages, which revalidate hourly and immediately after admin edits.
- Attachments are stored on local disk. On serverless or multi-instance hosting, replace the functions in `src/lib/uploads.ts` with object storage (S3, R2 or GCS) and keep the same signatures.
- Set real `SMTP_*` credentials so clients receive confirmations and password-reset emails.
- The legal pages (`/privacy`, `/terms`) contain clearly marked placeholder text that must be replaced with reviewed legal copy.
