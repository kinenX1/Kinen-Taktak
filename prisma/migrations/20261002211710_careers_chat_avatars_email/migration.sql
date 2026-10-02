-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'FREELANCE', 'INTERNSHIP');

-- CreateEnum
CREATE TYPE "WorkMode" AS ENUM ('REMOTE', 'HYBRID', 'ON_SITE');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('NEW', 'REVIEWING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('SENT', 'FAILED', 'LOGGED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatarAt" TIMESTAMP(3),
ADD COLUMN     "locale" TEXT NOT NULL DEFAULT 'en';

-- CreateTable
CREATE TABLE "Avatar" (
    "userId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Avatar_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "ProjectMessage" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "authorId" TEXT,
    "fromStaff" BOOLEAN NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileBlob" (
    "id" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileBlob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobOpening" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "employmentType" "EmploymentType" NOT NULL DEFAULT 'FULL_TIME',
    "workMode" "WorkMode" NOT NULL DEFAULT 'REMOTE',
    "summary" TEXT NOT NULL,
    "responsibilities" TEXT[],
    "requirements" TEXT[],
    "niceToHave" TEXT[],
    "published" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobOpening_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobApplication" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "openingId" TEXT,
    "roleTitle" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'NEW',
    "userId" TEXT,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "country" TEXT,
    "city" TEXT,
    "linkedin" TEXT,
    "portfolio" TEXT,
    "github" TEXT,
    "yearsExperience" INTEGER,
    "skills" TEXT[],
    "languages" TEXT,
    "workMode" "WorkMode",
    "availability" TEXT,
    "expectedSalary" TEXT,
    "motivation" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "cvName" TEXT,
    "cvMime" TEXT,
    "cvSize" INTEGER,
    "cvBlobId" TEXT,
    "adminNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscriber" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "source" TEXT NOT NULL DEFAULT 'footer',
    "unsubscribedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subscriber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboundEmail" (
    "id" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "EmailStatus" NOT NULL,
    "error" TEXT,
    "sentById" TEXT,
    "recipientId" TEXT,
    "contactMessageId" TEXT,
    "applicationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboundEmail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectMessage_requestId_createdAt_idx" ON "ProjectMessage"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectMessage_fromStaff_readAt_idx" ON "ProjectMessage"("fromStaff", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "JobOpening_slug_key" ON "JobOpening"("slug");

-- CreateIndex
CREATE INDEX "JobOpening_published_sortOrder_idx" ON "JobOpening"("published", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "JobApplication_reference_key" ON "JobApplication"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "JobApplication_cvBlobId_key" ON "JobApplication"("cvBlobId");

-- CreateIndex
CREATE INDEX "JobApplication_status_createdAt_idx" ON "JobApplication"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Subscriber_email_key" ON "Subscriber"("email");

-- CreateIndex
CREATE INDEX "OutboundEmail_to_createdAt_idx" ON "OutboundEmail"("to", "createdAt");

-- AddForeignKey
ALTER TABLE "Avatar" ADD CONSTRAINT "Avatar_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMessage" ADD CONSTRAINT "ProjectMessage_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ProjectRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMessage" ADD CONSTRAINT "ProjectMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobApplication" ADD CONSTRAINT "JobApplication_openingId_fkey" FOREIGN KEY ("openingId") REFERENCES "JobOpening"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobApplication" ADD CONSTRAINT "JobApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundEmail" ADD CONSTRAINT "OutboundEmail_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundEmail" ADD CONSTRAINT "OutboundEmail_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundEmail" ADD CONSTRAINT "OutboundEmail_contactMessageId_fkey" FOREIGN KEY ("contactMessageId") REFERENCES "ContactMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundEmail" ADD CONSTRAINT "OutboundEmail_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "JobApplication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Default job openings (managed from /admin/careers afterwards)
INSERT INTO "JobOpening" ("id", "slug", "title", "team", "location", "employmentType", "workMode", "summary", "responsibilities", "requirements", "niceToHave", "published", "sortOrder", "createdAt", "updatedAt") VALUES ('opening_frontend_engineer', 'frontend-engineer', 'Frontend Engineer (React / Next.js)', 'Engineering', 'Remote', 'FULL_TIME', 'REMOTE', 'Build fast, animated, accessible interfaces for client websites and web apps, from the first prototype to production.', ARRAY['Turn Figma designs into pixel-accurate React and Next.js interfaces', 'Build motion and micro-interactions that stay smooth on every device', 'Keep performance, accessibility and SEO high on every release', 'Review code and share what you learn with the team']::TEXT[], ARRAY['2+ years building production interfaces with React and TypeScript', 'Solid CSS skills, including layout, responsive design and animation', 'Experience with Next.js or a similar framework', 'Clear written communication in English or French']::TEXT[], ARRAY['Motion, GSAP or three.js experience', 'An eye for typography and detail']::TEXT[], true, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT ("slug") DO NOTHING;
INSERT INTO "JobOpening" ("id", "slug", "title", "team", "location", "employmentType", "workMode", "summary", "responsibilities", "requirements", "niceToHave", "published", "sortOrder", "createdAt", "updatedAt") VALUES ('opening_full_stack_engineer', 'full-stack-engineer', 'Full-stack Engineer (Node.js / PostgreSQL)', 'Engineering', 'Remote', 'FULL_TIME', 'REMOTE', 'Design and ship the backends behind our client platforms: APIs, databases, authentication, payments and integrations.', ARRAY['Design data models and APIs for SaaS, e-commerce and internal tools', 'Implement secure authentication, roles and permissions', 'Integrate payments, email and third-party services', 'Deploy, monitor and improve production systems']::TEXT[], ARRAY['3+ years of backend or full-stack experience with Node.js and TypeScript', 'Strong SQL and PostgreSQL knowledge', 'Good understanding of web security basics', 'Comfortable owning a feature end to end']::TEXT[], ARRAY['Experience with Prisma, serverless or Vercel', 'AI or automation projects']::TEXT[], true, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT ("slug") DO NOTHING;
INSERT INTO "JobOpening" ("id", "slug", "title", "team", "location", "employmentType", "workMode", "summary", "responsibilities", "requirements", "niceToHave", "published", "sortOrder", "createdAt", "updatedAt") VALUES ('opening_product_designer', 'product-designer', 'Product Designer (UI/UX)', 'Design', 'Remote', 'FULL_TIME', 'REMOTE', 'Shape how our clients'' products look, feel and work, from research and flows to polished interfaces and design systems.', ARRAY['Run discovery workshops and map user journeys', 'Design wireframes, prototypes and high-fidelity interfaces', 'Build and maintain design systems in Figma', 'Work closely with engineers until the product ships']::TEXT[], ARRAY['A portfolio showing real product design work', 'Strong Figma skills, including components and prototyping', 'Understanding of accessibility and responsive design', 'Able to explain and defend design decisions']::TEXT[], ARRAY['Motion design skills', 'Basic HTML and CSS']::TEXT[], true, 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT ("slug") DO NOTHING;
INSERT INTO "JobOpening" ("id", "slug", "title", "team", "location", "employmentType", "workMode", "summary", "responsibilities", "requirements", "niceToHave", "published", "sortOrder", "createdAt", "updatedAt") VALUES ('opening_motion_designer', 'motion-designer', 'Motion Designer', 'Design', 'Remote', 'FREELANCE', 'REMOTE', 'Create animated ads, product presentations and interface motion that make brands feel alive.', ARRAY['Design and animate ads and social content for client brands', 'Create motion guidelines and interaction specs for products', 'Produce launch videos and product showcases']::TEXT[], ARRAY['A showreel with motion graphics work', 'After Effects, Blender, Rive or a similar tool', 'A strong sense of timing, rhythm and composition']::TEXT[], ARRAY['3D skills', 'Experience animating for the web']::TEXT[], true, 30, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT ("slug") DO NOTHING;
INSERT INTO "JobOpening" ("id", "slug", "title", "team", "location", "employmentType", "workMode", "summary", "responsibilities", "requirements", "niceToHave", "published", "sortOrder", "createdAt", "updatedAt") VALUES ('opening_mobile_developer', 'mobile-developer', 'Mobile Developer (React Native / Flutter)', 'Engineering', 'Remote', 'FREELANCE', 'REMOTE', 'Build iOS and Android apps for our clients, from the first build to the App Store and Google Play.', ARRAY['Build cross-platform mobile apps with clean, testable code', 'Connect apps to APIs, push notifications and payments', 'Publish and maintain apps on the App Store and Google Play']::TEXT[], ARRAY['Apps you built that are live in a store', 'React Native or Flutter experience', 'Understanding of mobile UX conventions']::TEXT[], ARRAY['Native iOS or Android experience', 'Offline-first apps']::TEXT[], true, 40, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT ("slug") DO NOTHING;
INSERT INTO "JobOpening" ("id", "slug", "title", "team", "location", "employmentType", "workMode", "summary", "responsibilities", "requirements", "niceToHave", "published", "sortOrder", "createdAt", "updatedAt") VALUES ('opening_content_marketer', 'content-marketer', 'Social Media & Content Marketer', 'Marketing', 'Remote', 'PART_TIME', 'REMOTE', 'Tell the MovEra story on Instagram, LinkedIn and TikTok, and help new clients discover our work.', ARRAY['Plan and publish content across our social channels', 'Turn our projects into case studies, reels and posts', 'Track results and grow our audience']::TEXT[], ARRAY['Experience growing a brand or creator account', 'Strong writing in English and French', 'Comfortable with Canva, CapCut or similar tools']::TEXT[], ARRAY['Photography or video skills', 'Paid ads experience']::TEXT[], true, 50, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT ("slug") DO NOTHING;
INSERT INTO "JobOpening" ("id", "slug", "title", "team", "location", "employmentType", "workMode", "summary", "responsibilities", "requirements", "niceToHave", "published", "sortOrder", "createdAt", "updatedAt") VALUES ('opening_web_development_intern', 'web-development-intern', 'Web Development Intern', 'Engineering', 'Remote', 'INTERNSHIP', 'REMOTE', 'Learn how real client products are built by working alongside our engineers on live projects.', ARRAY['Build components and pages with React and Next.js', 'Fix bugs and write small features with a mentor', 'Join reviews, planning and client demos']::TEXT[], ARRAY['Basic HTML, CSS and JavaScript', 'A personal project or school project you can show', 'Curiosity and the will to learn fast']::TEXT[], ARRAY['React basics', 'Git and GitHub']::TEXT[], true, 60, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT ("slug") DO NOTHING;
