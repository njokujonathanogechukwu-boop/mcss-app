import Papa from "papaparse";

/**
 * Turns an uploaded spreadsheet into the same comma-separated text the
 * paste box produces, so both importers share one parsing path.
 *
 * .xlsx / .xls go through exceljs (first worksheet only). Anything else is
 * treated as delimited text and passed through unchanged; papaparse works
 * out the delimiter later.
 */
export async function fileToCsv(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  if (name.endsWith(".xlsx") || name.endsWith(".xlsm") || name.endsWith(".xls")) {
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

    const sheet = workbook.worksheets[0];
    if (!sheet) throw new Error("The workbook has no worksheets.");

    const rows: string[][] = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = [];
      // row.values is 1-based; index 0 is always empty.
      const values = row.values as unknown[];
      for (let c = 1; c < values.length; c++) cells.push(cellText(values[c]));
      rows.push(cells);
    });
    return Papa.unparse(rows);
  }

  return buffer.toString("utf8").replace(/^﻿/, "");
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return formatDmy(value);
  if (typeof value === "object") {
    const v = value as { richText?: { text: string }[]; result?: unknown; text?: string; hyperlink?: string };
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join("");
    if (v.result !== undefined) return cellText(v.result); // formula cell
    if (typeof v.text === "string") return v.text; // hyperlink cell
    return "";
  }
  return String(value);
}

function formatDmy(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}
