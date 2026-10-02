"use server";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/dal";
import { sendApplicationEmails } from "@/lib/emails";
import { rateLimit } from "@/lib/rate-limit";
import { generateReference } from "@/lib/reference";
import { deleteStoredFile, storeFile, validateCv } from "@/lib/uploads";
import { fieldErrorsOf, formValues, type FormState } from "@/lib/validation/common";
import { applicationSchema } from "@/lib/validation/careers";
import { getI18n } from "@/i18n/server";
import { getOpeningBySlug } from "@/lib/data/content";
import { SPONTANEOUS } from "@/config/careers";
import { en } from "@/i18n/dictionaries/en";

export type ApplicationState = FormState & { reference?: string };

async function uniqueReference() {
  for (let i = 0; i < 5; i++) {
    const reference = generateReference("JA");
    const clash = await db.jobApplication.findUnique({ where: { reference }, select: { id: true } });
    if (!clash) return reference;
  }
  throw new Error("Could not allocate a unique reference");
}

export async function applyAction(_prev: ApplicationState, formData: FormData): Promise<ApplicationState> {
  const { locale, t } = await getI18n();
  const f = t.careers.form;
  const values = formValues(formData);

  if (formData.get("website")) return { ok: true, reference: "JA-000000" };
  const limited = await rateLimit("apply", 5, 60 * 60 * 1000);
  if (!limited.ok) return { message: f.rateLimited, values };

  const raw = Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === "string"));
  const parsed = applicationSchema(t).safeParse(raw);
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error), values };
  const data = parsed.data;

  // Resolve the role: a published opening, or a spontaneous application.
  const opening = data.role === SPONTANEOUS ? null : await getOpeningBySlug("en", data.role);
  if (data.role !== SPONTANEOUS && !opening) return { fieldErrors: { role: [t.validation.choose] }, values };

  const cvFile = formData.get("cv");
  const hasCv = cvFile instanceof File && cvFile.size > 0;
  if (!hasCv && !data.linkedin && !data.portfolio && !data.github) {
    return { fieldErrors: { cv: [f.needLink] }, values };
  }
  let cv: Awaited<ReturnType<typeof validateCv>> | null = null;
  if (hasCv) {
    cv = await validateCv(cvFile);
    if ("error" in cv) return { fieldErrors: { cv: [cv.error === "size" ? f.cvTooLarge : f.cvInvalid] }, values };
  }

  const user = await getCurrentUser();
  let storedName: string | null = null;
  try {
    if (cv && !("error" in cv)) storedName = await storeFile(cv);
    const reference = await uniqueReference();
    const created = await db.jobApplication.create({
      data: {
        reference,
        openingId: opening?.id ?? null,
        roleTitle: opening?.title ?? "Spontaneous application",
        userId: user?.id ?? null,
        fullName: data.fullName,
        email: data.email,
        phone: data.phone ?? null,
        country: data.country ?? null,
        city: data.city ?? null,
        linkedin: data.linkedin ?? null,
        portfolio: data.portfolio ?? null,
        github: data.github ?? null,
        yearsExperience: data.yearsExperience ? Number(data.yearsExperience) : null,
        skills: (data.skills ?? "")
          .split(/[,\n]/)
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 30),
        languages: data.languages ?? null,
        workMode: data.workMode ?? null,
        availability: data.availability ?? null,
        expectedSalary: data.expectedSalary ?? null,
        motivation: data.motivation,
        locale,
        ...(cv && !("error" in cv) && storedName
          ? { cvName: cv.originalName, cvMime: cv.mimeType, cvSize: cv.buffer.length, cvBlobId: storedName }
          : {}),
      },
      select: { id: true, reference: true },
    });

    const localizedRole = opening ? ((await getOpeningBySlug(locale, opening.slug))?.title ?? opening.title) : t.careers.spontaneous;
    await sendApplicationEmails({
      id: created.id,
      reference: created.reference,
      roleTitle: localizedRole,
      fullName: data.fullName,
      email: data.email,
      locale,
      country: data.country,
      yearsLabel: data.yearsExperience ? en.options.experience[data.yearsExperience] : null,
      hasCv: !!storedName,
    });
    return { ok: true, reference: created.reference };
  } catch (error) {
    if (storedName) await deleteStoredFile(storedName);
    console.error("[apply] failed", error instanceof Prisma.PrismaClientKnownRequestError ? error.code : error);
    return { message: f.failed, values };
  }
}
