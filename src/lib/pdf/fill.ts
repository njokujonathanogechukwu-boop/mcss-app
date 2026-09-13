import { PDFDocument, PDFCheckBox, PDFTextField } from "pdf-lib";
import { collectWidgets, groupRows, pageRows, pagesOf, setText, setCheck, type Widget } from "./fields";
import { s88Blocks } from "./s88-layout";

/**
 * Writes app data into the official fillable forms. Each filler finds its
 * boxes by their position on the page (the same way the S-21 reader does),
 * with descriptive field names used as a hint when the form has them.
 *
 * Every filler returns the finished PDF flattened, so the figures are part
 * of the page and survive printing, merging and viewers that ignore forms.
 */

export type S21FillData = {
  name: string;
  dateOfBirth: string;
  baptismDate: string;
  gender: "MALE" | "FEMALE";
  anointed: boolean;
  appointment: "PUBLISHER" | "MINISTERIAL_SERVANT" | "ELDER";
  pioneerStatus: "NONE" | "AUXILIARY" | "REGULAR" | "SPECIAL";
  /** Tables on the form are filled with these service years, first table first. */
  years: {
    serviceYear: number;
    /** Twelve entries, September first. Null = nothing on file. */
    months: ({ shared: boolean; studies: number; aux: boolean; hours: number | null; remarks: string | null } | null)[];
    totalHours: number;
  }[];
};

const SEP_FIRST = [9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8];
export { SEP_FIRST };

async function load(template: Buffer) {
  return PDFDocument.load(template, { ignoreEncryption: true, updateMetadata: false });
}

export type FillOptions = { flatten?: boolean };

async function finish(pdf: PDFDocument, opts?: FillOptions): Promise<Uint8Array> {
  // The official forms carry checkbox appearance streams whose tick is drawn
  // far outside its box, so a flattened card shows giant ticks over the text.
  // Redraw each tick at its own widget size first.
  for (const field of pdf.getForm().getFields()) {
    if (field instanceof PDFCheckBox) {
      try {
        field.updateAppearances();
      } catch {
        // keep whatever appearance the form shipped with
      }
    }
  }
  if (opts?.flatten === false) {
    pdf.getForm().updateFieldAppearances();
    return pdf.save();
  }
  try {
    pdf.getForm().flatten();
  } catch {
    // Some forms carry fields without appearance streams that flatten
    // cannot render; fall back to leaving the form fillable.
    try {
      pdf.getForm().updateFieldAppearances();
    } catch {
      // ignore
    }
  }
  return pdf.save();
}

const byName = (ws: Widget[], re: RegExp, kind: Widget["kind"]) =>
  ws.find((w) => w.kind === kind && re.test(w.name.toLowerCase()));

/** The twelve-row month tables on an S-21: rows with two checkboxes and two or more text boxes. */
function s21Tables(widgets: Widget[]) {
  const tables: { page: number; rows: Widget[][]; yearBox?: Widget }[] = [];
  for (const page of pagesOf(widgets)) {
    const ws = widgets.filter((w) => w.page === page);
    const rows = groupRows(ws).filter(
      (r) => r.filter((w) => w.kind === "check").length >= 2 && r.filter((w) => w.kind === "text").length >= 2,
    );
    for (let i = 0; i + 12 <= rows.length; i += 12) {
      const table = rows.slice(i, i + 12);
      const top = Math.max(...table[0].map((w) => w.y));
      const bottomOfPrevious = i > 0 ? Math.min(...rows[i - 1].map((w) => w.y - w.h)) : Infinity;
      // The service-year box: a short text field above the table (and below any previous table).
      const yearBox = ws
        .filter((w) => w.kind === "text" && w.y - w.h >= top && w.y < bottomOfPrevious && w.w < 120)
        .sort((a, b) => a.y - b.y)[0];
      tables.push({ page, rows: table, yearBox });
    }
  }
  return tables;
}

export async function fillS21(template: Buffer, data: S21FillData, opts?: FillOptions): Promise<Uint8Array> {
  const pdf = await load(template);
  const widgets = collectWidgets(pdf);
  const page0Text = widgets.filter((w) => w.kind === "text" && w.page === 0).sort((a, b) => b.y - a.y || a.x - b.x);
  const headerRows = groupRows(widgets.filter((w) => w.kind === "check" && w.page === 0));
  const pairs = headerRows.filter((r) => r.length === 2);
  const appointmentRow = headerRows.find((r) => r.length >= 4 && r.length <= 6);

  setText(byName(widgets, /name/, "text") ?? page0Text[0], data.name);
  setText(byName(widgets, /birth|dob/, "text") ?? page0Text[1], data.dateOfBirth);
  setText(byName(widgets, /bapt/, "text") ?? page0Text[2], data.baptismDate);

  setCheck(byName(widgets, /^(?!.*fe)male|\bmale\b/, "check") ?? pairs[0]?.[0], data.gender === "MALE");
  setCheck(byName(widgets, /female/, "check") ?? pairs[0]?.[1], data.gender === "FEMALE");
  setCheck(byName(widgets, /other\s*sheep|othersheep/, "check") ?? pairs[1]?.[0], !data.anointed);
  setCheck(byName(widgets, /anoint/, "check") ?? pairs[1]?.[1], data.anointed);
  setCheck(byName(widgets, /elder/, "check") ?? appointmentRow?.[0], data.appointment === "ELDER");
  setCheck(byName(widgets, /minist/, "check") ?? appointmentRow?.[1], data.appointment === "MINISTERIAL_SERVANT");
  setCheck(byName(widgets, /regular/, "check") ?? appointmentRow?.[2], data.pioneerStatus === "REGULAR");
  setCheck(byName(widgets, /special/, "check") ?? appointmentRow?.[3], data.pioneerStatus === "SPECIAL");

  const tables = s21Tables(widgets);
  tables.forEach((table, t) => {
    const year = data.years[t];
    if (!year) return;
    setText(table.yearBox, year.serviceYear);
    table.rows.forEach((row, r) => {
      const checks = row.filter((w) => w.kind === "check");
      const texts = row.filter((w) => w.kind === "text");
      const m = year.months[r];
      setCheck(checks[0], Boolean(m?.shared));
      setText(texts[0], m && m.shared && m.studies ? m.studies : "");
      setCheck(checks[1], Boolean(m?.aux));
      setText(texts[1], m && m.shared && m.hours !== null ? m.hours : "");
      setText(texts[2], m?.remarks ?? "");
    });
    // The total row, if it is a text field directly under the table.
    const last = table.rows[11][0];
    const totalBox = widgets
      .filter((w) => w.kind === "text" && w.page === table.page && w.y < last.y && w.y > last.y - 40)
      .sort((a, b) => a.x - b.x);
    const hoursCol = table.rows[11].filter((w) => w.kind === "text")[1];
    const total = hoursCol ? totalBox.find((w) => Math.abs(w.x - hoursCol.x) < 12) : undefined;
    if (total && year.totalHours > 0) setText(total, year.totalHours);
  });

  return finish(pdf, opts);
}

// ------------------------------------------------------------------ S-88

export type S88FillData = {
  /** Service years to write, left to right / first table first. */
  years: {
    serviceYear: number;
    /** Twelve rows, September first. */
    rows: { midweekMeetings: number; midweekTotal: number; midweekAverage: number; weekendMeetings: number; weekendTotal: number; weekendAverage: number }[];
  }[];
};

/**
 * The S-88 is four blocks of twelve month rows: the midweek meeting for two
 * service years across the top, the weekend meeting for the same two years
 * below. Which box is which is worked out by {@link s88Blocks}, so the same
 * geometry serves the importer that reads a filled form back in.
 */
export async function fillS88(template: Buffer, data: S88FillData, opts?: FillOptions): Promise<Uint8Array> {
  const pdf = await load(template);
  const blocks = s88Blocks(collectWidgets(pdf));

  for (const block of blocks) {
    const year = data.years[block.yearSlot];
    if (!year) continue;
    const midweek = block.half === "midweek";
    const figures = year.rows.map((r) =>
      midweek
        ? { meetings: r.midweekMeetings, total: r.midweekTotal, average: r.midweekAverage }
        : { meetings: r.weekendMeetings, total: r.weekendTotal, average: r.weekendAverage },
    );

    setText(block.yearBox, year.serviceYear);
    block.cells.forEach((c, m) => {
      const f = figures[m];
      if (!f) return;
      setText(c.meetings, f.meetings || "");
      setText(c.attendance, f.total || "");
      setText(c.average, f.average || "");
    });

    // "Average attendance each month" is the mean of the months that actually
    // met, which is how the congregation fills the official form — not the
    // year's attendance over twelve.
    const met = figures.filter((f) => f && f.meetings > 0);
    const footing = met.length ? met.reduce((t, f) => t + f.average, 0) / met.length : 0;
    setText(block.averageEachMonth, footing ? Math.round(footing * 100) / 100 : "");
  }

  return finish(pdf, opts);
}

// ------------------------------------------------------------------- S-1

export type S1FillData = {
  congregation: string;
  monthLabel: string;
  activePublishers: number;
  rows: {
    publishers: { reports: number; studies: number };
    auxiliary: { reports: number; studies: number; hours: number };
    regular: { reports: number; studies: number; hours: number };
    special: { reports: number; studies: number; hours: number };
  };
  totals: { reports: number; studies: number; hours: number };
  memorial?: { attendance: number; partakers: number } | null;
};

/**
 * The S-1 layout varies more between editions, so this filler works from
 * field names first and falls back to a four-row table of three boxes
 * (reports, studies, hours) found on the page.
 */
export async function fillS1(template: Buffer, data: S1FillData, opts?: FillOptions): Promise<Uint8Array> {
  const pdf = await load(template);
  const widgets = collectWidgets(pdf);
  const texts = widgets.filter((w) => w.kind === "text");
  const named = (re: RegExp) => texts.find((w) => re.test(w.name.toLowerCase().replace(/[^a-z0-9]/g, "")));

  setText(named(/congregation|cong/) , data.congregation);
  setText(named(/month|period/), data.monthLabel);
  setText(named(/active/), data.activePublishers);
  setText(named(/memorial.*attend|attend.*memorial/), data.memorial?.attendance ?? "");
  setText(named(/partaker/), data.memorial?.partakers ?? "");

  const rowFor = (re: RegExp) => ({
    reports: texts.find((w) => re.test(norm(w.name)) && /report|number|count/.test(norm(w.name))),
    studies: texts.find((w) => re.test(norm(w.name)) && /stud/.test(norm(w.name))),
    hours: texts.find((w) => re.test(norm(w.name)) && /hour/.test(norm(w.name))),
  });
  const pub = rowFor(/^(?!.*pioneer)(?!.*aux)(?!.*regular)(?!.*special).*publisher/);
  const aux = rowFor(/aux/);
  const reg = rowFor(/regular/);
  const spe = rowFor(/special|missionar/);
  const tot = rowFor(/total/);

  const anyNamed = [pub, aux, reg, spe].some((r) => r.reports || r.studies);
  if (anyNamed) {
    setText(pub.reports, data.rows.publishers.reports); setText(pub.studies, data.rows.publishers.studies);
    setText(aux.reports, data.rows.auxiliary.reports); setText(aux.studies, data.rows.auxiliary.studies); setText(aux.hours, data.rows.auxiliary.hours);
    setText(reg.reports, data.rows.regular.reports); setText(reg.studies, data.rows.regular.studies); setText(reg.hours, data.rows.regular.hours);
    setText(spe.reports, data.rows.special.reports); setText(spe.studies, data.rows.special.studies); setText(spe.hours, data.rows.special.hours);
    setText(tot.reports, data.totals.reports); setText(tot.studies, data.totals.studies); setText(tot.hours, data.totals.hours);
  } else {
    // Positional fallback: the first run of 4+ rows with three text boxes each.
    const rows = pageRows(widgets, 0).map((r) => r.filter((w) => w.kind === "text")).filter((r) => r.length === 3);
    const table = rows.slice(0, 5);
    const values = [
      [data.rows.publishers.reports, data.rows.publishers.studies, null],
      [data.rows.auxiliary.reports, data.rows.auxiliary.studies, data.rows.auxiliary.hours],
      [data.rows.regular.reports, data.rows.regular.studies, data.rows.regular.hours],
      [data.rows.special.reports, data.rows.special.studies, data.rows.special.hours],
      [data.totals.reports, data.totals.studies, data.totals.hours],
    ];
    table.forEach((boxes, r) => boxes.forEach((box, c) => setText(box, values[r]?.[c] ?? "")));
  }

  return finish(pdf, opts);
}

function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// ------------------------------------------------------------- diagnostics

/**
 * Writes every field's own name into it and ticks every checkbox, so a
 * printout shows which internal field sits where. Used to check a newly
 * uploaded form.
 */
export async function testFill(template: Buffer): Promise<Uint8Array> {
  const pdf = await load(template);
  const form = pdf.getForm();
  for (const field of form.getFields()) {
    try {
      if (field instanceof PDFTextField) field.setText(field.getName().slice(-18));
      else if (field instanceof PDFCheckBox) field.check();
    } catch {
      // ignore
    }
  }
  return finish(pdf);
}

export type TemplateSummary = {
  fieldCount: number;
  textFields: number;
  checkboxes: number;
  pages: number;
  /** What the app expects to find, and whether it did. */
  checks: { label: string; ok: boolean }[];
};

/** A quick read of a freshly uploaded form, shown on the settings page. */
export async function inspectTemplate(template: Buffer, kind: "S21" | "S1" | "S88"): Promise<TemplateSummary> {
  const pdf = await load(template);
  const widgets = collectWidgets(pdf);
  const textFields = widgets.filter((w) => w.kind === "text").length;
  const checkboxes = widgets.filter((w) => w.kind === "check").length;
  const checks: TemplateSummary["checks"] = [];

  if (kind === "S21") {
    const tables = s21Tables(widgets);
    const page0Text = widgets.filter((w) => w.kind === "text" && w.page === 0);
    checks.push({ label: "Name, date of birth and baptism boxes", ok: page0Text.length >= 3 });
    checks.push({ label: "Sex and appointment checkboxes", ok: groupRows(widgets.filter((w) => w.kind === "check" && w.page === 0)).some((r) => r.length >= 4) });
    checks.push({ label: `Month table${tables.length === 1 ? "" : "s"} of twelve rows (found ${tables.length})`, ok: tables.length >= 1 });
    checks.push({ label: "Service year box above the table", ok: tables.some((t) => t.yearBox) });
  } else if (kind === "S88") {
    const blocks = s88Blocks(widgets);
    const halves = new Set(blocks.map((b) => b.half));
    checks.push({
      label: `Four blocks of twelve month rows (found ${blocks.length})`,
      ok: blocks.length >= 4,
    });
    checks.push({ label: "Both the midweek and the weekend meeting", ok: halves.size === 2 });
    checks.push({ label: "A box for each service year", ok: blocks.some((b) => b.yearBox) });
  } else {
    const names = widgets.map((w) => norm(w.name));
    checks.push({ label: "Fields named for publishers / pioneers", ok: names.some((n) => /publisher|pioneer/.test(n)) });
    checks.push({ label: "Fields named for reports, studies, hours", ok: names.some((n) => /stud/.test(n)) && names.some((n) => /hour/.test(n)) });
    checks.push({ label: "At least four rows of three boxes (fallback)", ok: pageRows(widgets, 0).filter((r) => r.filter((w) => w.kind === "text").length === 3).length >= 4 });
  }

  return { fieldCount: widgets.length, textFields, checkboxes, pages: pdf.getPageCount(), checks };
}
