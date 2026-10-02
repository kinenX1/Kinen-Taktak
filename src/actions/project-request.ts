"use server";

import { Prisma, type ProjectType } from "@prisma/client";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { labelFor, uploadRules } from "@/config/project-brief";
import { db } from "@/lib/db";
import { sendRequestReceivedEmails, sendWelcomeEmail } from "@/lib/emails";
import { fmt } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { getI18n } from "@/i18n/server";
import { localizedFieldErrors, localizeFieldErrors } from "@/i18n/errors";
import { rateLimit } from "@/lib/rate-limit";
import { generateReference } from "@/lib/reference";
import { getCurrentUser } from "@/lib/auth/dal";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { deleteStoredFile, storeFile, validateUpload, type ValidatedFile } from "@/lib/uploads";
import { passwordField, formValues, type FormState } from "@/lib/validation/common";
import { projectDraftSchema, projectRequestSchema } from "@/lib/validation/project-request";

export type ProjectFormState = FormState & { reference?: string };

const MAX_TOTAL_BYTES = uploadRules.maxFiles * uploadRules.maxFileSizeMb * 1024 * 1024;

async function collectFiles(formData: FormData, alreadyAttached: number, t: Dictionary) {
  const files = formData
    .getAll("files")
    .filter((f): f is File => typeof f === "object" && f !== null && "size" in f && f.size > 0);

  if (files.length + alreadyAttached > uploadRules.maxFiles) {
    return { error: fmt(t.brief.server.tooManyFiles, { max: uploadRules.maxFiles }) };
  }
  if (files.reduce((sum, f) => sum + f.size, 0) > MAX_TOTAL_BYTES) {
    return { error: t.brief.server.filesTooLarge };
  }

  const valid: ValidatedFile[] = [];
  for (const file of files) {
    const result = await validateUpload(file);
    if ("error" in result) return { error: result.error };
    valid.push(result);
  }
  return { files: valid };
}

async function uniqueReference() {
  for (let i = 0; i < 5; i++) {
    const reference = generateReference();
    const clash = await db.projectRequest.findUnique({ where: { reference }, select: { id: true } });
    if (!clash) return reference;
  }
  throw new Error("Could not allocate a unique reference");
}

/**
 * Resolves the user submitting the brief. Signed-in users are used directly;
 * visitors create their client account as part of the brief.
 */
async function resolveUser(
  formData: FormData,
  contact: { name: string; email: string },
  { locale, t }: Awaited<ReturnType<typeof getI18n>>,
): Promise<{ userId: string; newAccount: boolean } | { error: FormState }> {
  const current = await getCurrentUser();
  if (current) return { userId: current.id, newAccount: false };

  const password = passwordField.safeParse(formData.get("accountPassword"));
  if (!password.success) {
    return {
      error: { fieldErrors: localizeFieldErrors({ accountPassword: password.error.issues.map((i) => i.message) }, t) },
    };
  }
  if (!contact.email || !contact.name) {
    return { error: { message: t.brief.server.needContact } };
  }
  const existing = await db.user.findUnique({ where: { email: contact.email }, select: { id: true } });
  if (existing) {
    return { error: { fieldErrors: { contactEmail: [t.brief.server.accountExists] } } };
  }
  const user = await db.user.create({
    data: { name: contact.name, email: contact.email, locale, passwordHash: await hashPassword(password.data) },
    select: { id: true },
  });
  return { userId: user.id, newAccount: true };
}

export async function submitProjectRequest(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const i18n = await getI18n();
  const { locale, t } = i18n;
  const values = formValues(formData, ["accountPassword"]);
  const isDraft = formData.get("intent") === "draft";

  const limited = await rateLimit("project-request", 20, 60 * 60 * 1000);
  if (!limited.ok) return { message: t.brief.server.rateLimited, values };

  const raw = Object.fromEntries(
    [...formData.entries()].filter(([, v]) => typeof v === "string"),
  );
  const parsed = isDraft ? projectDraftSchema.safeParse(raw) : projectRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      fieldErrors: localizedFieldErrors(parsed.error, t),
      message: t.brief.server.needsAttention,
      values,
    };
  }
  const data = parsed.data;

  // Existing draft being completed or re-saved.
  const draftRef = typeof formData.get("draftRef") === "string" ? String(formData.get("draftRef")) : "";
  const current = await getCurrentUser();
  const draft =
    draftRef && current
      ? await db.projectRequest.findFirst({
          where: { reference: draftRef, userId: current.id, status: "DRAFT" },
          select: { id: true, reference: true, _count: { select: { files: true } } },
        })
      : null;
  if (draftRef && !draft) {
    return { message: t.brief.server.draftMissing, values };
  }

  const collected = await collectFiles(formData, draft?._count.files ?? 0, t);
  if ("error" in collected) {
    return { fieldErrors: { files: [collected.error!] }, values };
  }

  const who = await resolveUser(formData, { name: data.contactName, email: data.contactEmail }, i18n);
  if ("error" in who) return { ...who.error, values };

  const storedNames: string[] = [];
  let reference: string;
  try {
    for (const file of collected.files) storedNames.push(await storeFile(file));
    const fileRows = collected.files.map((f, i) => ({
      originalName: f.originalName,
      storedName: storedNames[i]!,
      mimeType: f.mimeType,
      size: f.buffer.length,
    }));

    const fields = {
      title: data.title,
      projectType: (data.projectType ?? "OTHER") as ProjectType,
      otherType: data.projectType === "OTHER" ? (data.otherType ?? null) : null,
      contactName: data.contactName,
      contactEmail: data.contactEmail,
      contactPhone: data.contactPhone ?? null,
      contactCompany: data.contactCompany ?? null,
      contactCountry: data.contactCountry ?? null,
      description: data.description,
      business: data.business ?? null,
      targetUsers: data.targetUsers ?? null,
      features: data.features ?? null,
      budget: data.budget ?? null,
      budgetCustom: data.budget === "custom" ? (data.budgetCustom ?? null) : null,
      timeline: data.timeline ?? null,
      inspiration: data.inspiration ?? [],
      additionalInfo: data.additionalInfo ?? null,
      status: isDraft ? ("DRAFT" as const) : ("SUBMITTED" as const),
      submittedAt: isDraft ? null : new Date(),
    };

    if (draft) {
      reference = draft.reference;
      await db.$transaction([
        db.projectRequest.update({
          where: { id: draft.id },
          data: { ...fields, files: { create: fileRows } },
        }),
        ...(isDraft
          ? []
          : [
              db.projectUpdate.create({
                data: { requestId: draft.id, kind: "STATUS_CHANGE", fromStatus: "DRAFT", toStatus: "SUBMITTED" },
              }),
            ]),
      ]);
    } else {
      reference = await uniqueReference();
      await db.projectRequest.create({
        data: {
          ...fields,
          reference,
          userId: who.userId,
          files: { create: fileRows },
          updates: isDraft
            ? undefined
            : { create: { kind: "STATUS_CHANGE", toStatus: "SUBMITTED" } },
        },
      });
    }

    // Fill empty profile details from the brief — never overwrite.
    const profile = await db.user.findUnique({
      where: { id: who.userId },
      select: { phone: true, company: true, country: true },
    });
    if (profile) {
      await db.user.update({
        where: { id: who.userId },
        data: {
          phone: profile.phone ?? fields.contactPhone,
          company: profile.company ?? fields.contactCompany,
          country: profile.country ?? fields.contactCountry,
        },
      });
    }
  } catch (error) {
    await Promise.all(storedNames.map(deleteStoredFile));
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      console.error("[project-request] database error", error.code);
    } else {
      console.error("[project-request] failed", error);
    }
    return { message: t.brief.server.failed, values };
  }

  if (who.newAccount) {
    await createSession(who.userId);
    await sendWelcomeEmail({ name: data.contactName, email: data.contactEmail, locale });
  }
  revalidatePath("/dashboard", "layout");

  if (isDraft) redirect(`/dashboard/requests/${reference}?saved=draft`);

  await sendRequestReceivedEmails({
    reference,
    title: data.title,
    contactName: data.contactName,
    contactEmail: data.contactEmail,
    locale,
    typeLabel: labelFor.projectType(data.projectType),
    budgetLabel: data.budget === "custom" ? (data.budgetCustom ?? "Custom") : labelFor.budget(data.budget),
    timelineLabel: labelFor.timeline(data.timeline),
  });

  return { ok: true, reference };
}

/** Deletes a draft that belongs to the current user. */
export async function deleteDraftAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const reference = String(formData.get("reference") ?? "");
  const draft = await db.projectRequest.findFirst({
    where: { reference, userId: user.id, status: "DRAFT" },
    include: { files: { select: { storedName: true } } },
  });
  if (draft) {
    await db.projectRequest.delete({ where: { id: draft.id } });
    await Promise.all(draft.files.map((f) => deleteStoredFile(f.storedName)));
  }
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard/requests");
}
