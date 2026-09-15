import "server-only";

import { prisma } from "@/lib/prisma";
import { displayName, safeFileName } from "@/lib/format";
import { envelopeIndication, type CaseEntry } from "@/lib/standing-case";
import { buildS77CaseRecord, s77FileName, type S77Input } from "@/lib/pdf/s77";

export type CaseFile = S77Input & { pdfName: string };

const toEntry = (r: {
  id: string;
  kind: CaseEntry["kind"];
  eventDate: Date;
  announcedDate: Date | null;
  liftedDate: Date | null;
  notes: string | null;
}): CaseEntry => ({
  id: r.id,
  kind: r.kind,
  eventDate: r.eventDate,
  announcedDate: r.announcedDate,
  liftedDate: r.liftedDate,
  notes: r.notes,
});

/** Reads one standing entry with the publisher, its restrictions and the whole
 *  record behind the envelope indication. Null when the entry has gone. */
export async function loadCase(recordId: string): Promise<CaseFile | null> {
  const record = await prisma.standingRecord.findUnique({
    where: { id: recordId },
    include: {
      publisher: {
        select: {
          firstName: true,
          lastName: true,
          gender: true,
          dateOfBirth: true,
          baptismDate: true,
          isBaptized: true,
        },
      },
      restrictions: { orderBy: { eventDate: "desc" } },
      documents: {
        orderBy: [{ createdAt: "desc" }, { fileName: "asc" }],
        select: { id: true, fileName: true, size: true, createdAt: true },
      },
    },
  });
  if (!record) return null;

  const every = await prisma.standingRecord.findMany({
    where: { publisherId: record.publisherId, parentId: null },
    select: { id: true, kind: true, eventDate: true, announcedDate: true, liftedDate: true, notes: true },
    orderBy: { eventDate: "asc" },
  });

  const person = { ...record.publisher };
  return {
    person,
    entry: { ...toEntry(record), restrictions: record.restrictions.map(toEntry) },
    indication: envelopeIndication(displayName(person), every.map(toEntry)),
    documents: record.documents.map((d) => ({ fileName: d.fileName, size: d.size, createdAt: d.createdAt })),
    pdfName: s77FileName(person, toEntry(record)),
  };
}

export async function buildCasePdf(recordId: string): Promise<{ pdf: Uint8Array; fileName: string } | null> {
  const file = await loadCase(recordId);
  if (!file) return null;
  const pdf = await buildS77CaseRecord(file);
  return { pdf, fileName: file.pdfName };
}

/** The case file as a folder: the S-77 record, the envelope wording on its own,
 *  and every document uploaded against that entry. */
export async function buildCaseFolder(recordId: string): Promise<{ zip: Uint8Array; fileName: string } | null> {
  const file = await loadCase(recordId);
  if (!file) return null;

  const pdf = await buildS77CaseRecord(file);
  const rows = await prisma.standingDocument.findMany({
    where: { standingRecordId: recordId },
    orderBy: [{ createdAt: "asc" }, { fileName: "asc" }],
    select: { fileName: true, bytes: true },
  });

  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  zip.file(file.pdfName, pdf);
  zip.file("envelope-indication.txt", `${file.indication.join("\r\n")}\r\n`);

  const used = new Set<string>();
  for (const row of rows) {
    const base = safeFileName(row.fileName);
    const dot = base.lastIndexOf(".");
    const stem = dot > 0 ? base.slice(0, dot) : base;
    const ext = dot > 0 ? base.slice(dot) : "";
    let name = base;
    for (let n = 2; used.has(name); n++) name = `${stem} (${n})${ext}`;
    used.add(name);
    zip.file(`documents/${name}`, Buffer.from(row.bytes));
  }

  const zipBytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  return { zip: zipBytes, fileName: file.pdfName.replace(/\.pdf$/, ".zip") };
}
