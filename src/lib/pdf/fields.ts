import { PDFDocument, PDFCheckBox, PDFTextField, PDFField } from "pdf-lib";

/**
 * A form field's widget with its position on the page. The official forms
 * change their internal field names between editions, so both the S-21
 * reader and the form fillers work from where a box sits rather than what
 * it is called.
 */
export type Widget = {
  field: PDFField;
  name: string;
  kind: "check" | "text";
  page: number;
  x: number;
  /** Top edge, in PDF units (origin bottom-left). */
  y: number;
  w: number;
  h: number;
  text: string;
  checked: boolean;
};

export function collectWidgets(pdf: PDFDocument): Widget[] {
  const pages = pdf.getPages();
  const pageIndex = new Map(pages.map((p, i) => [p.ref.toString(), i]));

  let fields: PDFField[];
  try {
    fields = pdf.getForm().getFields();
  } catch {
    return [];
  }

  const widgets: Widget[] = [];
  for (const field of fields) {
    const kind = field instanceof PDFCheckBox ? "check" : field instanceof PDFTextField ? "text" : null;
    if (!kind) continue;
    const text = kind === "text" ? ((field as PDFTextField).getText() ?? "").trim() : "";
    const checked = kind === "check" ? (field as PDFCheckBox).isChecked() : false;
    for (const w of field.acroField.getWidgets()) {
      const rect = w.getRectangle();
      const pRef = w.P();
      const page = pRef ? (pageIndex.get(pRef.toString()) ?? 0) : 0;
      widgets.push({
        field, name: field.getName(), kind, page,
        x: rect.x, y: rect.y + rect.height, w: rect.width, h: rect.height, text, checked,
      });
    }
  }
  return widgets;
}

/** Groups widgets into rows by their top edge, top of page first, left to right within a row. */
export function groupRows(ws: Widget[]): Widget[][] {
  const sorted = ws.slice().sort((a, b) => b.y - a.y);
  const rows: Widget[][] = [];
  for (const w of sorted) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(last[0].y - w.y) <= Math.max(4, last[0].h * 0.5)) last.push(w);
    else rows.push([w]);
  }
  return rows.map((r) => r.sort((a, b) => a.x - b.x));
}

export function setText(w: Widget | undefined, value: string | number | null | undefined) {
  if (!w || w.kind !== "text") return;
  const v = value === null || value === undefined ? "" : String(value);
  try {
    (w.field as PDFTextField).setText(v);
  } catch {
    // A field with a max length or a combed layout may reject long text; leave it.
  }
}

export function setCheck(w: Widget | undefined, on: boolean) {
  if (!w || w.kind !== "check") return;
  try {
    if (on) (w.field as PDFCheckBox).check();
    else (w.field as PDFCheckBox).uncheck();
  } catch {
    // ignore
  }
}

/** Every widget on a page, grouped into rows, top first. */
export function pageRows(widgets: Widget[], page: number) {
  return groupRows(widgets.filter((w) => w.page === page));
}

export function pagesOf(widgets: Widget[]) {
  return [...new Set(widgets.map((w) => w.page))].sort((a, b) => a - b);
}
