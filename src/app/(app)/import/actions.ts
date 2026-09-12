"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { guard, recordAudit } from "@/lib/auth";
import { parseCsv, type ParsedRow } from "@/lib/import";
import { fileToCsv } from "@/lib/spreadsheet";
import {
  parseReportsSheet, matchPublisher,
  type ParsedReport, type ReportLayout, type GridCellMeaning,
} from "@/lib/import-reports";
import { MONTH_NAMES } from "@/lib/service-year";
import { readS21, parseCardDate, splitCardName, type S21Card, type S21Month } from "@/lib/import-s21";

const MAX_TEXT = 2_000_000;

/**
 * The sheet arrives either as pasted text or as an uploaded file. A file
 * wins when both are present. Returns the text to parse, or an error.
 */
async function readSource(formData: FormData): Promise<{ csv: string } | { error: string }> {
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > 3_500_000) return { error: "That file is over 3.5 MB. Save the sheet as CSV, or split it." };
    try {
      const csv = (await fileToCsv(file)).trim();
      if (!csv) return { error: "The file was empty, or the first worksheet had nothing in it." };
      return { csv };
    } catch {
      return { error: "Could not read that file. Save it as .xlsx or .csv and try again." };
    }
  }
  const csv = String(formData.get("csv") ?? "").trim();
  if (!csv) return { error: "Paste the rows from your sheet, or choose a file." };
  if (csv.length > MAX_TEXT) return { error: "That is too large for one paste. Split it into batches." };
  return { csv };
}

// ================================================================ publishers

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

  const source = await readSource(formData);
  if ("error" in source) return { error: source.error };
  const { csv } = source;

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

// ====================================================== field service history

export type ReportImportRow = ParsedReport & {
  publisherId: string | null;
  publisherName: string | null;
  ambiguous: boolean;
  existing: boolean;
};

export type ReportImportState = {
  error?: string;
  ok?: string;
  csv?: string;
  serviceYear?: number;
  cellMeaning?: GridCellMeaning;
  cardPublisherId?: string;
  preview?: {
    layout: ReportLayout;
    rows: ReportImportRow[];
    problems: { line: number; message: string }[];
    months: { year: number; month: number }[];
    unmatched: string[];
    existingCount: number;
  };
};

type ReportOptions = { serviceYear: number; cellMeaning: GridCellMeaning; cardPublisherId?: string };

function readReportOptions(formData: FormData): ReportOptions {
  const serviceYear = Number(formData.get("serviceYear"));
  const meaningRaw = String(formData.get("cellMeaning") ?? "hours");
  const cellMeaning: GridCellMeaning =
    meaningRaw === "studies" || meaningRaw === "tick" ? meaningRaw : "hours";
  const cardPublisherId = String(formData.get("cardPublisherId") ?? "").trim() || undefined;
  return {
    serviceYear: Number.isInteger(serviceYear) && serviceYear > 1990 ? serviceYear : new Date().getFullYear(),
    cellMeaning,
    cardPublisherId,
  };
}

async function analyseReports(csv: string, options: ReportOptions) {
  const parsed = parseReportsSheet(csv, options);
  if (!parsed.layout) {
    return { ...parsed, layout: null, rows: [] as ReportImportRow[], unmatched: [] as string[], existingCount: 0 };
  }

  const publishers = await prisma.publisher.findMany({
    select: { id: true, firstName: true, lastName: true },
  });
  type Pub = (typeof publishers)[number];
  const byId = new Map(publishers.map((p) => [p.id, p]));

  // Resolve every distinct sheet name once.
  const resolved = new Map<string, { publisher: Pub | null; ambiguous: boolean }>();
  const unmatched = new Set<string>();

  const rows: ReportImportRow[] = parsed.reports.map((r) => {
    let publisher: Pub | null = null;
    let ambiguous = false;

    if (parsed.layout === "card") {
      publisher = options.cardPublisherId ? (byId.get(options.cardPublisherId) ?? null) : null;
    } else if (r.name) {
      let m = resolved.get(r.name);
      if (!m) {
        m = matchPublisher(r.name, publishers);
        resolved.set(r.name, m);
      }
      publisher = m.publisher;
      ambiguous = m.ambiguous;
      if (!publisher) unmatched.add(r.name);
    }

    return {
      ...r,
      publisherId: publisher?.id ?? null,
      publisherName: publisher ? `${publisher.firstName} ${publisher.lastName}` : null,
      ambiguous,
      existing: false,
    };
  });

  // Which of these months are already on file for these publishers?
  const ids = [...new Set(rows.map((r) => r.publisherId).filter((id): id is string => !!id))];
  const existing = ids.length
    ? await prisma.serviceReport.findMany({
        where: { publisherId: { in: ids }, OR: parsed.months.map((m) => ({ year: m.year, month: m.month })) },
        select: { publisherId: true, year: true, month: true },
      })
    : [];
  const onFile = new Set(existing.map((e) => `${e.publisherId}|${e.year}|${e.month}`));
  let existingCount = 0;
  for (const row of rows) {
    if (row.publisherId && onFile.has(`${row.publisherId}|${row.year}|${row.month}`)) {
      row.existing = true;
      existingCount++;
    }
  }

  return { ...parsed, layout: parsed.layout, rows, unmatched: [...unmatched], existingCount };
}

export async function previewReportImport(
  _prev: ReportImportState,
  formData: FormData,
): Promise<ReportImportState> {
  const auth = await guard("import:run");
  if (!auth.ok) return { error: auth.error };

  const source = await readSource(formData);
  if ("error" in source) return { error: source.error };
  const { csv } = source;
  const options = readReportOptions(formData);
  const echo = { csv, ...options };

  const analysis = await analyseReports(csv, options);
  if (!analysis.layout) {
    return { ...echo, error: analysis.problems[0]?.message ?? "Nothing could be read from that sheet." };
  }
  if (analysis.layout === "card" && !options.cardPublisherId) {
    return { ...echo, error: "This looks like a single publisher's card. Choose whose card it is, then check again." };
  }
  const preview = { ...analysis, layout: analysis.layout };
  if (analysis.rows.length === 0) {
    return { ...echo, preview, error: "No reports could be read from that sheet." };
  }
  return { ...echo, preview };
}

export async function commitReportImport(
  _prev: ReportImportState,
  formData: FormData,
): Promise<ReportImportState> {
  const auth = await guard("import:run");
  if (!auth.ok) return { error: auth.error };

  const csv = String(formData.get("csv") ?? "").trim();
  if (!csv) return { error: "The sheet was lost. Start again." };
  const options = readReportOptions(formData);
  const overwrite = formData.get("overwrite") === "true";

  const analysis = await analyseReports(csv, options);
  if (!analysis.layout) return { error: "The sheet could no longer be read. Start again." };

  const toWrite = analysis.rows.filter((r) => r.publisherId && (overwrite || !r.existing));
  if (toWrite.length === 0) {
    return { error: "Nothing to import: every report was either already on file or for a name that is not on file." };
  }

  // Pioneer standing is recorded per report. The sheet does not carry it,
  // so take the publisher's current standing, with the sheet's AP mark
  // overriding it for that month. Hours on a non-pioneer month are kept as
  // written: before November 2023 every publisher reported hours.
  const publishers = await prisma.publisher.findMany({
    where: { id: { in: [...new Set(toWrite.map((r) => r.publisherId!))] } },
    select: { id: true, pioneerStatus: true },
  });
  const standing = new Map(publishers.map((p) => [p.id, p.pioneerStatus]));

  await prisma.$transaction(
    toWrite.map((r) => {
      const current = standing.get(r.publisherId!) ?? "NONE";
      const pioneerStatusUsed = r.aux ? ("AUXILIARY" as const) : current;
      const data = {
        sharedInMinistry: r.shared,
        bibleStudies: r.shared ? r.studies : 0,
        hours: r.shared ? r.hours : null,
        pioneerStatusUsed,
        remarks: r.remarks,
        source: "IMPORT" as const,
        submittedById: auth.session.userId,
      };
      return prisma.serviceReport.upsert({
        where: { publisherId_year_month: { publisherId: r.publisherId!, year: r.year, month: r.month } },
        create: { publisherId: r.publisherId!, year: r.year, month: r.month, ...data },
        update: data,
      });
    }),
  );

  const months = analysis.months.slice().sort((a, b) => a.year - b.year || a.month - b.month);
  const first = months[0];
  const last = months[months.length - 1];
  const span =
    months.length === 1
      ? `${MONTH_NAMES[first.month - 1]} ${first.year}`
      : `${MONTH_NAMES[first.month - 1]} ${first.year} to ${MONTH_NAMES[last.month - 1]} ${last.year}`;

  await recordAudit(
    auth.session.userId, "imported", "ServiceReport", null,
    `Imported ${toWrite.length} field service report(s), ${span}`,
  );

  revalidatePath("/reports");
  revalidatePath("/reports/summary");
  revalidatePath("/dashboard");
  revalidatePath("/publishers");

  const skippedExisting = overwrite ? 0 : analysis.rows.filter((r) => r.publisherId && r.existing).length;
  const skippedUnmatched = analysis.rows.filter((r) => !r.publisherId).length;
  const notes: string[] = [];
  if (skippedExisting) notes.push(`${skippedExisting} already on file and left as they were`);
  if (skippedUnmatched) notes.push(`${skippedUnmatched} for names not on file`);

  return {
    ok: `${toWrite.length} report${toWrite.length === 1 ? "" : "s"} imported, ${span}${notes.length ? ` (${notes.join("; ")})` : ""}.`,
  };
}

// ================================================================ S-21 cards

export type CardImportRow = {
  fileName: string;
  name: string | null;
  firstName: string;
  lastName: string;
  gender: "MALE" | "FEMALE" | null;
  dateOfBirth: string | null;
  baptismDate: string | null;
  anointed: boolean;
  appointment: "PUBLISHER" | "MINISTERIAL_SERVANT" | "ELDER";
  pioneerStatus: "NONE" | "REGULAR" | "SPECIAL";
  serviceYears: number[];
  months: S21Month[];
  problems: string[];
  /** Matched publisher on file, or null when a new record would be created. */
  publisherId: string | null;
  publisherName: string | null;
  ambiguous: boolean;
  existingMonths: number;
};

export type CardImportState = {
  error?: string;
  ok?: string;
  /** The parsed cards, carried to the commit step. */
  cards?: string;
  serviceYear?: number;
  preview?: {
    rows: CardImportRow[];
    totalMonths: number;
    newPublishers: number;
    existingMonths: number;
  };
};

async function resolveCards(cards: S21Card[]): Promise<CardImportRow[]> {
  const publishers = await prisma.publisher.findMany({
    select: { id: true, firstName: true, lastName: true },
  });

  const rows: CardImportRow[] = cards.map((c) => {
    const { firstName, lastName } = c.name ? splitCardName(c.name) : { firstName: "", lastName: "" };
    const match = c.name ? matchPublisher(c.name, publishers) : { publisher: null, ambiguous: false };
    return {
      fileName: c.fileName,
      name: c.name,
      firstName,
      lastName,
      gender: c.gender,
      dateOfBirth: c.dateOfBirth,
      baptismDate: c.baptismDate,
      anointed: c.anointed,
      appointment: c.appointment,
      pioneerStatus: c.pioneerStatus,
      serviceYears: c.serviceYears,
      months: c.months,
      problems: [...c.problems],
      publisherId: match.publisher?.id ?? null,
      publisherName: match.publisher ? `${match.publisher.firstName} ${match.publisher.lastName}` : null,
      ambiguous: match.ambiguous,
      existingMonths: 0,
    };
  });

  // Two cards for the same person in one batch: the second one is flagged.
  const seen = new Map<string, number>();
  rows.forEach((r, i) => {
    if (!r.name) return;
    const key = r.publisherId ?? `${r.lastName}|${r.firstName}`.toLowerCase();
    if (seen.has(key)) r.problems.push(`Same person as ${rows[seen.get(key)!].fileName}; months from both cards are imported.`);
    else seen.set(key, i);
  });

  const ids = [...new Set(rows.map((r) => r.publisherId).filter((id): id is string => !!id))];
  if (ids.length) {
    const existing = await prisma.serviceReport.findMany({
      where: { publisherId: { in: ids } },
      select: { publisherId: true, year: true, month: true },
    });
    const onFile = new Set(existing.map((e) => `${e.publisherId}|${e.year}|${e.month}`));
    for (const r of rows) {
      if (!r.publisherId) continue;
      r.existingMonths = r.months.filter((m) => onFile.has(`${r.publisherId}|${m.year}|${m.month}`)).length;
    }
  }
  return rows;
}

function emptyCard(fileName: string, problem: string): S21Card {
  return {
    fileName, name: null, dateOfBirth: null, baptismDate: null, gender: null, anointed: false,
    appointment: "PUBLISHER", pioneerStatus: "NONE", serviceYears: [], months: [], problems: [problem],
  };
}

export async function previewCardImport(
  _prev: CardImportState,
  formData: FormData,
): Promise<CardImportState> {
  const auth = await guard("import:run");
  if (!auth.ok) return { error: auth.error };

  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const serviceYearRaw = Number(formData.get("serviceYear"));
  const serviceYear = Number.isInteger(serviceYearRaw) && serviceYearRaw > 1990 ? serviceYearRaw : undefined;

  if (files.length === 0) return { serviceYear, error: "Choose one or more S-21 PDF files first." };
  const total = files.reduce((n, f) => n + f.size, 0);
  if (total > 3_500_000) {
    return { serviceYear, error: `Those files add up to ${(total / 1_000_000).toFixed(1)} MB. Upload in smaller batches (about 3 MB at a time).` };
  }

  const cards: S21Card[] = [];
  for (const file of files) {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      cards.push(emptyCard(file.name, "Not a PDF file."));
      continue;
    }
    cards.push(await readS21(Buffer.from(await file.arrayBuffer()), file.name, serviceYear));
  }

  const rows = await resolveCards(cards);
  const usable = rows.filter((r) => r.name && r.months.length > 0);
  const preview = {
    rows,
    totalMonths: usable.reduce((n, r) => n + r.months.length, 0),
    newPublishers: usable.filter((r) => !r.publisherId && !r.ambiguous).length,
    existingMonths: usable.reduce((n, r) => n + r.existingMonths, 0),
  };
  const state: CardImportState = { serviceYear, cards: JSON.stringify(cards), preview };
  if (usable.length === 0) state.error = "Nothing usable was read from those files. See the notes on each card below.";
  return state;
}

export async function commitCardImport(
  _prev: CardImportState,
  formData: FormData,
): Promise<CardImportState> {
  const auth = await guard("import:run");
  if (!auth.ok) return { error: auth.error };

  let cards: S21Card[];
  try {
    cards = JSON.parse(String(formData.get("cards") ?? "[]"));
    if (!Array.isArray(cards)) throw new Error();
  } catch {
    return { error: "The cards were lost. Choose the files again." };
  }
  const createMissing = formData.get("createMissing") === "true";
  const overwrite = formData.get("overwrite") === "true";

  const rows = await resolveCards(cards);
  const usable = rows.filter((r) => r.name && r.months.length > 0 && !r.ambiguous);
  if (usable.length === 0) return { error: "Nothing to import." };

  let created = 0;
  let reports = 0;
  let skippedMonths = 0;
  let skippedPeople = 0;

  await prisma.$transaction(async (tx) => {
    const existingByPublisher = new Map<string, Set<string>>();

    for (const r of usable) {
      let publisherId = r.publisherId;
      let standing: "NONE" | "REGULAR" | "SPECIAL" | "AUXILIARY" = r.pioneerStatus;
      const dob = parseCardDate(r.dateOfBirth);
      const bap = parseCardDate(r.baptismDate);

      if (!publisherId) {
        if (!createMissing) {
          skippedPeople++;
          continue;
        }
        const p = await tx.publisher.create({
          data: {
            firstName: r.firstName || "—",
            lastName: r.lastName || r.firstName,
            gender: r.gender ?? "MALE",
            dateOfBirth: dob,
            baptismDate: bap,
            isBaptized: Boolean(bap),
            isAnointed: r.anointed,
            appointment: r.appointment,
            pioneerStatus: r.pioneerStatus,
            status: "ACTIVE",
            notes: `Imported from S-21 (${r.fileName}).${r.gender ? "" : " Sex was not ticked on the card; check it."}`,
          },
          select: { id: true },
        });
        publisherId = p.id;
        created++;
      } else {
        // Fill in blanks on the existing record; never overwrite what is there.
        const current = await tx.publisher.findUnique({
          where: { id: publisherId },
          select: { dateOfBirth: true, baptismDate: true, pioneerStatus: true },
        });
        const fill: { dateOfBirth?: Date; baptismDate?: Date; isBaptized?: boolean } = {};
        if (current && !current.dateOfBirth && dob) fill.dateOfBirth = dob;
        if (current && !current.baptismDate && bap) {
          fill.baptismDate = bap;
          fill.isBaptized = true;
        }
        if (Object.keys(fill).length) await tx.publisher.update({ where: { id: publisherId }, data: fill });
        standing = current?.pioneerStatus ?? standing;
      }

      if (!existingByPublisher.has(publisherId)) {
        const found = await tx.serviceReport.findMany({
          where: { publisherId },
          select: { year: true, month: true },
        });
        existingByPublisher.set(publisherId, new Set(found.map((e) => `${e.year}|${e.month}`)));
      }
      const onFile = existingByPublisher.get(publisherId)!;

      for (const m of r.months) {
        if (onFile.has(`${m.year}|${m.month}`) && !overwrite) {
          skippedMonths++;
          continue;
        }
        const data = {
          sharedInMinistry: m.shared,
          bibleStudies: m.shared ? m.studies : 0,
          hours: m.shared ? m.hours : null,
          pioneerStatusUsed: m.aux ? ("AUXILIARY" as const) : standing,
          remarks: m.remarks,
          source: "IMPORT" as const,
          submittedById: auth.session.userId,
        };
        await tx.serviceReport.upsert({
          where: { publisherId_year_month: { publisherId, year: m.year, month: m.month } },
          create: { publisherId, year: m.year, month: m.month, ...data },
          update: data,
        });
        reports++;
      }
    }
  }, { timeout: 60_000 });

  await recordAudit(
    auth.session.userId, "imported", "ServiceReport", null,
    `Imported ${usable.length} S-21 card(s): ${created} new publisher(s), ${reports} report(s)`,
  );

  revalidatePath("/publishers");
  revalidatePath("/reports");
  revalidatePath("/reports/summary");
  revalidatePath("/dashboard");

  const notes: string[] = [];
  if (created) notes.push(`${created} new publisher record${created === 1 ? "" : "s"} created`);
  if (skippedMonths) notes.push(`${skippedMonths} month${skippedMonths === 1 ? "" : "s"} already on file left as they were`);
  if (skippedPeople) notes.push(`${skippedPeople} card${skippedPeople === 1 ? "" : "s"} skipped for people not on file`);

  return {
    ok: `${reports} report${reports === 1 ? "" : "s"} imported from ${usable.length} card${usable.length === 1 ? "" : "s"}${notes.length ? ` (${notes.join("; ")})` : ""}.`,
  };
}
