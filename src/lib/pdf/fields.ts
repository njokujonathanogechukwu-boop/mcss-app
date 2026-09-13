import { PDFArray, PDFCheckBox, PDFDict, PDFDocument, PDFField, PDFName, PDFRef, PDFTextField } from "pdf-lib";

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

/**
 * Repairs a form whose AcroForm `/Fields` array is empty while the fields
 * themselves still sit on the pages as merged field-and-widget annotations —
 * which is how the official S-21 ships. Acrobat fixes that when it opens the
 * file; pdf-lib does not, so without this the form reads as having no
 * fillable fields at all.
 */
function adoptOrphanWidgets(pdf: PDFDocument) {
  let acroForm: ReturnType<PDFDocument["catalog"]["getOrCreateAcroForm"]> | null = null;
  let known: Set<string> | null = null;

  for (const page of pdf.getPages()) {
    const annots = page.node.Annots();
    if (!annots) continue;

    for (let i = 0; i < annots.size(); i++) {
      const entry = annots.get(i);
      const dict = pdf.context.lookupMaybe(entry, PDFDict);
      if (!dict) continue;
      const subtype = dict.get(PDFName.of("Subtype"));
      if (!(subtype instanceof PDFName) || subtype.asString() !== "/Widget") continue;
      // `/FT` of its own and no `/Parent` means this annotation is the field
      // as well as its widget; a kid inherits both from elsewhere.
      if (!dict.get(PDFName.of("FT")) || dict.get(PDFName.of("Parent"))) continue;

      if (!acroForm || !known) {
        acroForm = pdf.catalog.getOrCreateAcroForm();
        known = new Set(acroForm.getFields().map(([, ref]) => ref.toString()));
      }

      let ref = entry instanceof PDFRef ? entry : null;
      if (!ref) {
        // A dictionary written straight into the annotation array has no ref
        // to register, so give it one and point the array at it: the field
        // and the widget have to stay the same object.
        ref = pdf.context.register(dict);
        annots.set(i, ref);
      }
      if (known.has(ref.toString())) continue;
      known.add(ref.toString());
      acroForm.addField(ref);
    }
  }
}

export function collectWidgets(pdf: PDFDocument): Widget[] {
  adoptOrphanWidgets(pdf);
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
