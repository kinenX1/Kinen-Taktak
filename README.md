# MovEra

The website and client platform for **MovEra**, a digital product studio. It has three parts:

- **Marketing site:** home, work (portfolio and case studies), services, about, careers (open roles and an application form with CV upload), contact and legal pages, in English and French
- **Client portal:** accounts with profile photos, a multi-step project brief with file uploads and drafts, a dashboard with request status tracking, and a live chat with the team on every request
- **Admin panel:** incoming requests (search, filter, status changes, internal notes), client chats, clients, contact messages, job applications and openings, an audience list of everyone who left an email with a composer to write to them, and portfolio and services content

## Stack

| Layer      | Choice                                                                  |
| ---------- | ----------------------------------------------------------------------- |
| Framework  | Next.js 16 (App Router, Server Actions, Turbopack), React 19, TypeScript |
| Styling    | Tailwind CSS v4, with design tokens in `src/app/globals.css`             |
| Motion     | `motion` (Framer Motion), Lenis smooth scroll, a custom canvas flow field, React `<ViewTransition>` |
| Database   | PostgreSQL through Prisma 6                                              |
| Auth       | Custom database sessions and Argon2id password hashing (`@node-rs/argon2`) |
| Validation | Zod 4, run on the server for every action                                |
| Email      | Nodemailer over SMTP with branded HTML templates (logged to the console when not configured) |
| i18n       | English and French dictionaries in `src/i18n`, chosen by cookie or browser language |

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
| `npm run build` / `npm start`    | Apply migrations, production build, and server      |
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
| `UPLOAD_DIR`               | no       | Legacy folder for attachments saved to disk by earlier versions; new files are stored in the database |
| `SMTP_*`, `EMAIL_FROM`     | no       | Without `SMTP_HOST`, emails are printed to the server log. Gmail works with an App Password (see `.env.example`) |
| `ADMIN_NOTIFICATION_EMAIL` | no       | Receives notifications for new requests, chat messages, contact messages and applications |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | seed only | Creates the first administrator               |

Content and options that are meant to be edited:

- `src/config/site.ts`: navigation, contact email, social links, and an optional response-time promise shown after a brief is submitted (off by default)
- `src/config/project-brief.ts`: project types, budget ranges, timelines, statuses and upload limits
- `src/i18n/dictionaries/{en,fr}.ts`: every interface text, including the process, values and pillars copy. TypeScript checks that both languages have the same keys
- `src/content/*`: seed content for services, the demo portfolio and job openings, with French versions in `src/content/fr`. A French translation is shown only while the stored text still matches the seed, so anything edited in `/admin` appears as written
- `/admin/portfolio`, `/admin/services` and `/admin/careers`: manage published content without code changes

### Demo portfolio

The six seeded projects (Tavola, Ledgerline, Atelier Nord, Halden Architects, Fleetwise and Pulse Care) are **concept projects**, not real clients. They are stored with `isDemo = true` and labelled "Concept" on the site, and they make no claims about real-world results. Replace or unpublish them from `/admin/portfolio`. Set a `coverImage` to swap a generated cover for real imagery.

## Architecture

```
prisma/                 schema, migrations, seed
src/
  proxy.ts              optimistic redirect for /dashboard and /admin (no session cookie → /login)
  actions/              server actions: auth, project-request, contact, account, chat, careers, newsletter, email, locale, admin
  app/
    (site)/             marketing pages and /start-project (navbar, footer, smooth scroll, page transitions)
    (auth)/             login, register, forgot/reset password
    dashboard/          client portal
    admin/              admin panel
    api/                authorised downloads (files, CVs), profile photos, chat polling
  components/           ui primitives, motion, layout, home, work, brief, dashboard, admin, visuals
  config/               editable site and brief configuration
  content/              seed copy (English) and its French versions
  i18n/                 locale detection, dictionaries, client provider
  lib/
    auth/               password hashing, sessions, data-access guards (requireUser/requireAdmin)
    data/               queries: public content, client-scoped, admin-only
    validation/         Zod schemas shared by actions
    uploads.ts          signature-verified file storage (database-backed)
    emails.ts           every email the site sends, in the recipient's language
```

**Data model:** `User` (role `CLIENT` or `ADMIN`) → `ProjectRequest` (status lifecycle, human-readable `MV-XXXXXX` reference) → `ProjectFile` and `ProjectUpdate` (status changes and notes, each visible to the client or internal). `ProjectMessage` holds the client/team chat. Marketing content lives in `PortfolioProject`, `Service` and `JobOpening`; applications in `JobApplication`; contact-form submissions in `ContactMessage`; newsletter sign-ups in `Subscriber`; and emails written from the admin panel in `OutboundEmail`. Uploaded bytes live in `FileBlob` and `Avatar`. A request becomes a "project" once its status reaches `IN_PROGRESS`.

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

- `npm run build` applies pending migrations (`prisma migrate deploy`) before `next build`, so a deploy on Vercel updates the database automatically. The build therefore needs `DATABASE_URL`.
- Pages render per request (for the visitor's language) while marketing content is cached for an hour and refreshed immediately after admin edits.
- Attachments, CVs and profile photos are stored in PostgreSQL, so they survive serverless deploys. Vercel limits request bodies to about 4.5 MB, which caps the size of a single upload there.
- Set real `SMTP_*` credentials so clients receive confirmations and password-reset emails.
- The legal pages (`/privacy`, `/terms`) contain clearly marked placeholder text that must be replaced with reviewed legal copy.

## Drones War

`drones-war/` holds a separate online team battle game with its own Node server and package. It doesn't share any code with the website. See [`drones-war/README.md`](drones-war/README.md) to run it.
