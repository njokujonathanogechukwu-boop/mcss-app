"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/auth";
import { selfUpdateSchema, fieldErrors } from "@/lib/validation";

export type SelfState = { ok?: string; errors?: Record<string, string> };

export async function updateMyDetails(
  token: string,
  _prev: SelfState,
  formData: FormData,
): Promise<SelfState> {
  const publisher = await prisma.publisher.findUnique({
    where: { selfToken: token },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!publisher) {
    return { errors: { _form: "This link is no longer valid. Please ask the secretary for a new one." } };
  }

  const parsed = selfUpdateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  await prisma.publisher.update({ where: { id: publisher.id }, data: parsed.data });
  await recordAudit(
    null,
    "self-update",
    "Publisher",
    publisher.id,
    `${publisher.firstName} ${publisher.lastName} updated their own bio-data through their personal link.`,
  );

  revalidatePath("/publishers");
  revalidatePath("/records");
  return { ok: "Saved. Thank you — the secretary now has your updated details." };
}
