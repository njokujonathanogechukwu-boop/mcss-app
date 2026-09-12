import { prisma } from "@/lib/prisma";
import type { FormKind } from "@prisma/client";

export const FORM_LABELS: Record<FormKind, { code: string; title: string }> = {
  S21: { code: "S-21", title: "Congregation’s Publisher Record" },
  S1: { code: "S-1", title: "Congregation Report" },
  S88: { code: "S-88", title: "Congregation Meeting Attendance Record" },
};

/** The uploaded official form of this kind, or null to use the built-in layout. */
export async function getTemplate(kind: FormKind): Promise<Buffer | null> {
  const t = await prisma.formTemplate.findUnique({ where: { kind }, select: { data: true } });
  return t ? Buffer.from(t.data) : null;
}

export async function listTemplates() {
  return prisma.formTemplate.findMany({
    select: { kind: true, fileName: true, fieldCount: true, uploadedAt: true, uploadedById: true },
    orderBy: { kind: "asc" },
  });
}
