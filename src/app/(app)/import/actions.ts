"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { guard, recordAudit } from "@/lib/auth";
import { parseCsv, type ParsedRow } from "@/lib/import";

export type ImportState = {
  error?: string;
  ok?: string;
  csv?: string;
  preview?: {
    rows: (ParsedRow & { duplicate: boolean; groupResolved: string | null })[];
    problems: { line: number; message: string }[];
    recognised: string[];
    ignored: string[];
  };
};

async function analyse(csv: string) {
  const parsed = parseCsv(csv);

  const [existing, groups] = await Promise.all([
    prisma.publisher.findMany({ select: { firstName: true, lastName: true } }),
    prisma.serviceGroup.findMany({ select: { id: true, number: true, name: true } }),
  ]);

  const key = (f: string, l: string) => `${f.trim().toLowerCase()}|${l.trim().toLowerCase()}`;
  const onFile = new Set(existing.map((p) => key(p.firstName, p.lastName)));
  const seen = new Set<string>();

  const rows = parsed.rows.map((row) => {
    const k = key(row.firstName, row.lastName);
    const duplicate = onFile.has(k) || seen.has(k);
    seen.add(k);

    let groupId: string | null = null;
    if (row.groupLabel) {
      const digits = row.groupLabel.match(/\d+/);
      const byNumber = digits ? groups.find((g) => g.number === Number(digits[0])) : undefined;
      const byName = groups.find(
        (g) => g.name.toLowerCase() === row.groupLabel!.trim().toLowerCase(),
      );
      groupId = (byNumber ?? byName)?.id ?? null;
    }

    return { ...row, duplicate, groupResolved: groupId };
  });

  return { ...parsed, rows };
}

export async function previewImport(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const auth = await guard("import:run");
  if (!auth.ok) return { error: auth.error };

  const csv = String(formData.get("csv") ?? "").trim();
  if (!csv) return { error: "Paste the rows from your sheet first." };
  if (csv.length > 2_000_000) return { error: "That is too large for one paste. Split it into batches." };

  const preview = await analyse(csv);
  if (preview.rows.length === 0) {
    return { csv, preview, error: "Nothing could be read from that paste." };
  }
  return { csv, preview };
}

export async function commitImport(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const auth = await guard("import:run");
  if (!auth.ok) return { error: auth.error };

  const csv = String(formData.get("csv") ?? "").trim();
  const skipDuplicates = formData.get("skipDuplicates") === "true";
  if (!csv) return { error: "The paste was lost. Start again." };

  const analysis = await analyse(csv);
  const toCreate = analysis.rows.filter((r) => !(skipDuplicates && r.duplicate));
  if (toCreate.length === 0) {
    return { csv, preview: analysis, error: "Every row was a duplicate, so nothing was imported." };
  }

  // One transaction: either the whole batch lands or none of it does.
  await prisma.$transaction(
    toCreate.map((row) =>
      prisma.publisher.create({
        data: {
          firstName: row.firstName,
          lastName: row.lastName,
          gender: row.gender,
          dateOfBirth: row.dateOfBirth,
          baptismDate: row.baptismDate,
          isBaptized: row.isBaptized,
          appointment: row.appointment,
          pioneerStatus: row.pioneerStatus,
          status: row.status,
          groupId: row.groupResolved,
          phone: row.phone,
          email: row.email,
          address: row.address,
          emergencyContactName: row.emergencyContactName,
          emergencyContactPhone: row.emergencyContactPhone,
          notes: row.notes,
        },
      }),
    ),
  );

  await recordAudit(
    auth.session.userId, "imported", "Publisher", null,
    `Imported ${toCreate.length} publisher record(s)`,
  );

  revalidatePath("/publishers");
  revalidatePath("/dashboard");

  const skipped = analysis.rows.length - toCreate.length;
  return {
    ok: `${toCreate.length} publisher${toCreate.length === 1 ? "" : "s"} imported${skipped ? `, ${skipped} skipped as duplicates` : ""}.`,
  };
}
