import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFRef, PDFStream, PDFString } from "pdf-lib";
import { inflateSync } from "node:zlib";

/**
 * Reads what is actually printed on a PDF page, and where.
 *
 * The official forms are not all fillable: the S-21 in current use is a flat
 * page with no form fields at all, and a filled-in card may be flat too. To
 * write onto those, and to read them back, the app has to see the page the
 * way a viewer does — the words, their positions and the marks drawn over
 * them. pdf-lib only exposes form fields, so the content streams are read
 * here instead. No new dependency: the streams are Flate-compressed and
 * Node's zlib does the rest.
 */

export type TextItem = {
  page: number;
  /** Left edge of the first glyph, in PDF units (origin bottom-left). */
  x: number;
  /** Baseline. */
  y: number;
  size: number;
  font: string;
  text: string;
  /** How far the pen moves, in page units: where this item ends. */
  w: number;
};

/** A painted path: a rule, a tick, a box outline. */
export type InkMark = { page: number; x: number; y: number; w: number; h: number };

export type PdfPage = {
  width: number;
  height: number;
  items: TextItem[];
  ink: InkMark[];
  /** Raster images on the page. A scan is a page with images and no words. */
  images: number;
};

type FontInfo = { twoByte: boolean; toUnicode: Map<number, string> | null };

/** The document being read and the page being written to. */
type Ctx = { pdf: PDFDocument; cache: Map<string, FontInfo>; out: PdfPage; page: number };

/** The resources in scope at this point in the content stream. */
type Scope = { fonts: Map<string, FontInfo>; xobjects: unknown };

export async function readPdfPages(bytes: Uint8Array | Buffer): Promise<PdfPage[]> {
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const cache = new Map<string, FontInfo>();
  const pages: PdfPage[] = [];

  for (const [index, page] of pdf.getPages().entries()) {
    const size = page.getSize();
    const resources = page.node.Resources();
    const out: PdfPage = { width: size.width, height: size.height, items: [], ink: [], images: 0 };
    out.images = countImages(pdf, resources);
    const ctx: Ctx = { pdf, cache, out, page: index };
    interpret(contentStreams(pdf, page.node.Contents()).join("\n"), ctx, scopeOf(ctx, resources));
    readAnnotations(ctx, page.node.Annots(), scopeOf(ctx, resources));
    pages.push(out);
  }

  return pages;
}

/**
 * Resources are inherited: a stream that names no font of its own draws with
 * the ones its caller had. XObjects are inherited the same way, so a nested
 * form that leaves them out still resolves against the page.
 */
function scopeOf(ctx: Ctx, resources: unknown, inherited?: Scope): Scope {
  const dict = resources instanceof PDFRef ? ctx.pdf.context.lookup(resources) : resources;
  if (!(dict instanceof PDFDict)) return inherited ?? { fonts: new Map(), xobjects: undefined };
  return {
    fonts: inherited ? new Map([...inherited.fonts, ...pageFonts(ctx.pdf, dict, ctx.cache)]) : pageFonts(ctx.pdf, dict, ctx.cache),
    xobjects: dict.get(PDFName.of("XObject")) ?? inherited?.xobjects,
  };
}

// ------------------------------------------------------------------ streams

function contentStreams(pdf: PDFDocument, contents: PDFRef | PDFArray | PDFStream | undefined): string[] {
  if (!contents) return [];
  const objects: unknown[] = [];
  const obj = pdf.context.lookup(contents);
  if (obj instanceof PDFArray) {
    for (let i = 0; i < obj.size(); i++) objects.push(pdf.context.lookup(obj.get(i)));
  } else if (obj) objects.push(obj);
  return objects.map(decodeStream).filter((s): s is string => s !== null);
}

/** The operators in a stream, inflated when they are Flate-compressed. */
function decodeStream(obj: unknown): string | null {
  if (!(obj instanceof PDFRawStream)) return null;
  let b = Buffer.from(obj.contents);
  const filter = obj.dict.get(PDFName.of("Filter"))?.toString() ?? "";
  if (filter.includes("FlateDecode")) {
    try {
      b = inflateSync(b);
    } catch {
      return null; // a stream we cannot inflate contributes nothing
    }
  } else if (filter && filter !== "/") {
    return null; // ASCII85, LZW and friends: not worth supporting here
  }
  return b.toString("latin1");
}

function pageFonts(pdf: PDFDocument, resources: PDFDict | undefined, cache: Map<string, FontInfo>) {
  const fonts = new Map<string, FontInfo>();
  const dict = resources?.get(PDFName.of("Font"));
  if (!dict) return fonts;
  const lookup = pdf.context.lookup(dict);
  if (!(lookup instanceof PDFDict)) return fonts;

  for (const [name, value] of lookup.entries()) {
    // Content streams name a resource without the leading slash the dictionary
    // key carries, so the map is keyed the way the stream spells it.
    const key = name.asString().slice(1);
    const ref = value instanceof PDFRef ? value.toString() : key;
    let info = cache.get(ref);
    if (!info) {
      info = describeFont(pdf, pdf.context.lookup(value));
      cache.set(ref, info);
    }
    fonts.set(key, info);
  }
  return fonts;
}

function describeFont(pdf: PDFDocument, dict: unknown): FontInfo {
  if (!(dict instanceof PDFDict)) return { twoByte: false, toUnicode: null };
  const encoding = dict.get(PDFName.of("Encoding"));
  const twoByte = /^\/?Identity-[HV]$/.test(encoding?.toString() ?? "");
  const cmap = dict.get(PDFName.of("ToUnicode"));
  return { twoByte, toUnicode: cmap ? parseCMap(pdf, cmap) : null };
}

/** The /ToUnicode CMap, when the form carries one: code points to characters. */
function parseCMap(pdf: PDFDocument, ref: unknown): Map<number, string> | null {
  const stream = pdf.context.lookup(ref as PDFRef);
  if (!(stream instanceof PDFRawStream)) return null;
  let raw: string;
  try {
    const filter = stream.dict.get(PDFName.of("Filter"))?.toString() ?? "";
    const b = Buffer.from(stream.contents);
    raw = (filter.includes("FlateDecode") ? inflateSync(b) : b).toString("latin1");
  } catch {
    return null;
  }

  const map = new Map<number, string>();
  const hex = (s: string) => parseInt(s, 16);
  const codes = (s: string) => {
    // Two bytes per code when the CMap maps 2-byte CIDs, one otherwise.
    const out: number[] = [];
    const wide = s.length > 2 && s.length % 4 === 0;
    for (let i = 0; i < s.length; i += wide ? 4 : 2) out.push(hex(s.slice(i, i + (wide ? 4 : 2))));
    return out;
  };
  const utf16 = (s: string) => {
    let out = "";
    for (let i = 0; i + 4 <= s.length; i += 4) out += String.fromCharCode(hex(s.slice(i, i + 4)));
    return out || String.fromCharCode(hex(s));
  };

  for (const block of raw.split(/beginbfchar|beginbfrange/).slice(1)) {
    const ranged = !block.startsWith("endbfchar") && /endbfrange/.test(block) && !/endbfchar/.test(block);
    const pairs = block.match(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g) ?? [];
    if (ranged) {
      for (const m of block.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(<([0-9A-Fa-f]+)>|\[([^\]]*)\])/g)) {
        const lo = hex(m[1]);
        const hi = hex(m[2]);
        if (m[4]) {
          const dst = codes(m[4]);
          for (let c = lo; c <= hi && c - lo < dst.length; c++) map.set(c, utf16(dst[c - lo].toString(16).padStart(4, "0")));
        } else {
          const list = (m[5] ?? "").match(/<([0-9A-Fa-f]+)>/g) ?? [];
          list.forEach((entry, i) => {
            const code = hex(entry.slice(1, -1));
            map.set(code, utf16(m[4] ?? "") || String.fromCharCode(lo + i));
          });
          for (let c = lo, i = 0; c <= hi; c++, i++) if (!map.has(c)) map.set(c, String.fromCharCode(c));
        }
      }
    } else {
      for (const p of pairs) {
        const m = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/.exec(p);
        if (m) map.set(hex(m[1]), utf16(m[2]));
      }
    }
  }
  return map.size ? map : null;
}

function countImages(pdf: PDFDocument, resources: PDFDict | undefined): number {
  const dict = resources?.get(PDFName.of("XObject"));
  if (!dict) return 0;
  const lookup = pdf.context.lookup(dict);
  if (!(lookup instanceof PDFDict)) return 0;
  let n = 0;
  for (const [, value] of lookup.entries()) {
    const obj = pdf.context.lookup(value);
    if (obj instanceof PDFStream && obj.dict.get(PDFName.of("Subtype"))?.toString() === "/Image") n++;
  }
  return n;
}

/** The stream a `Do` names, when it draws rather than pictures: a form, not an image. */
function formXObject(pdf: PDFDocument, xobjects: unknown, name: string): PDFStream | null {
  const dict = pdf.context.lookup(xobjects as PDFRef | undefined);
  if (!(dict instanceof PDFDict)) return null;
  const stream = pdf.context.lookup(dict.get(PDFName.of(name)));
  if (!(stream instanceof PDFStream)) return null;
  return stream.dict.get(PDFName.of("Subtype"))?.toString() === "/Form" ? stream : null;
}

// -------------------------------------------------------------- annotations

/**
 * What was added to a page after it was printed. Filling a form that has no
 * fields — the official S-21 is flat — makes a viewer write into annotation
 * appearance streams instead of the page, so a value typed onto a card and a
 * tick drawn by hand both live here and nowhere else.
 */
function readAnnotations(ctx: Ctx, annots: PDFArray | undefined, scope: Scope) {
  if (!annots) return;
  const { pdf, out, page } = ctx;

  for (let i = 0; i < annots.size(); i++) {
    const dict = pdf.context.lookup(annots.get(i));
    if (!(dict instanceof PDFDict)) continue;

    const rect = numbersOf(pdf, dict.get(PDFName.of("Rect")));
    if (rect.length !== 4) continue;
    const left = Math.min(rect[0], rect[2]);
    const bottom = Math.min(rect[1], rect[3]);
    const w = Math.abs(rect[2] - rect[0]);
    const h = Math.abs(rect[3] - rect[1]);
    if (w < 0.5 || h < 0.5) continue;

    const ap = normalAppearance(pdf, dict);
    if (!ap) {
      // No appearance to draw: a note still carries what was typed into it.
      const typed = stringOf(pdf, dict.get(PDFName.of("Contents")));
      if (!typed) continue;
      const size = Math.min(12, h * 0.7);
      out.items.push({ page, x: left + 1, y: bottom + h * 0.25, size, font: "", text: typed, w: typed.length * size * 0.5 });
      continue;
    }

    // The appearance is drawn to fit the rectangle, whatever its own size.
    const sx = w / (Math.abs(ap.bbox[2] - ap.bbox[0]) || w);
    const sy = h / (Math.abs(ap.bbox[3] - ap.bbox[1]) || h);
    const tx = left - ap.bbox[0] * sx;
    const ty = bottom - ap.bbox[1] * sy;
    interpret(
      `q ${sx} 0 0 ${sy} ${tx} ${ty} cm ${ap.matrix ? `${ap.matrix.join(" ")} cm ` : ""}${ap.src} Q`,
      ctx,
      scopeOf(ctx, ap.resources, scope),
    );
  }
}

type Appearance = { src: string; bbox: number[]; matrix?: number[]; resources?: unknown };

function normalAppearance(pdf: PDFDocument, dict: PDFDict): Appearance | null {
  const ap = pdf.context.lookup(dict.get(PDFName.of("AP")));
  if (!(ap instanceof PDFDict)) return null;

  let n: unknown = pdf.context.lookup(ap.get(PDFName.of("N")));
  if (n instanceof PDFDict) {
    // One appearance per state (a box's /Off and its /Yes): /AS says which shows.
    const state = dict.get(PDFName.of("AS"));
    const chosen = state instanceof PDFName ? n.get(state) : undefined;
    n = pdf.context.lookup(chosen ?? n.entries()[0]?.[1]);
  }

  const src = decodeStream(n);
  if (src === null || !(n instanceof PDFStream)) return null;

  const bbox = numbersOf(pdf, n.dict.get(PDFName.of("BBox")));
  const matrix = numbersOf(pdf, n.dict.get(PDFName.of("Matrix")));
  return {
    src,
    bbox: bbox.length === 4 ? bbox : [0, 0, 1, 1],
    matrix: matrix.length === 6 ? matrix : undefined,
    resources: n.dict.get(PDFName.of("Resources")),
  };
}

function numbersOf(pdf: PDFDocument, obj: unknown): number[] {
  const arr = obj instanceof PDFRef ? pdf.context.lookup(obj) : obj;
  if (!(arr instanceof PDFArray)) return [];
  const out: number[] = [];
  for (let i = 0; i < arr.size(); i++) {
    const v = pdf.context.lookup(arr.get(i));
    if (v instanceof PDFNumber) out.push(v.asNumber());
  }
  return out;
}

function stringOf(pdf: PDFDocument, obj: unknown): string | null {
  const v = obj instanceof PDFRef ? pdf.context.lookup(obj) : obj;
  if (!(v instanceof PDFString)) return null;
  try {
    return v.decodeText().trim() || null;
  } catch {
    return v.asString().trim() || null;
  }
}

// ---------------------------------------------------------------- tokenizer

type Token = { t: "num"; v: number } | { t: "str"; v: string } | { t: "name"; v: string } | { t: "op"; v: string };

const WS = new Set([" ", "\t", "\r", "\n", "\f", "\0"]);
const DELIM = new Set(["(", ")", "<", ">", "[", "]", "{", "}", "/", "%"]);

function tokenize(src: string): Token[] {
  const toks: Token[] = [];
  const n = src.length;
  let i = 0;

  while (i < n) {
    const c = src[i];
    if (WS.has(c)) { i++; continue; }
    if (c === "%") { while (i < n && src[i] !== "\n" && src[i] !== "\r") i++; continue; }

    if (c === "(") {
      let s = "";
      let depth = 1;
      i++;
      while (i < n && depth > 0) {
        const ch = src[i];
        if (ch === "\\") {
          const nx = src[i + 1];
          if (nx >= "0" && nx <= "7") {
            let oct = "";
            let j = i + 1;
            while (j < n && oct.length < 3 && src[j] >= "0" && src[j] <= "7") oct += src[j++];
            s += String.fromCharCode(parseInt(oct, 8));
            i = j;
            continue;
          }
          const esc: Record<string, string> = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" };
          s += esc[nx] ?? nx;
          i += 2;
          continue;
        }
        if (ch === "(") depth++;
        else if (ch === ")") { depth--; if (depth === 0) { i++; break; } }
        s += ch;
        i++;
      }
      toks.push({ t: "str", v: s });
      continue;
    }

    if (c === "<" && src[i + 1] === "<") { toks.push({ t: "op", v: "<<" }); i += 2; continue; }
    if (c === ">" && src[i + 1] === ">") { toks.push({ t: "op", v: ">>" }); i += 2; continue; }
    if (c === "<") {
      i++;
      let s = "";
      while (i < n && src[i] !== ">") { if (!WS.has(src[i])) s += src[i]; i++; }
      i++;
      // Hex strings carry raw code points, not text; keep them for the caller.
      let out = "";
      if (s.length % 2) s += "0";
      for (let k = 0; k < s.length; k += 2) out += String.fromCharCode(parseInt(s.slice(k, k + 2), 16));
      toks.push({ t: "str", v: out });
      continue;
    }

    if (c === "[" || c === "]" || c === "{") { toks.push({ t: "op", v: c }); i++; continue; }

    if (c === "/") {
      i++;
      let s = "";
      while (i < n && !WS.has(src[i]) && !DELIM.has(src[i])) {
        if (src[i] === "#") { s += String.fromCharCode(parseInt(src.slice(i + 1, i + 3), 16)); i += 3; continue; }
        s += src[i++];
      }
      toks.push({ t: "name", v: s });
      continue;
    }

    if (/[-+.0-9]/.test(c)) {
      let s = "";
      while (i < n && /[-+.0-9]/.test(src[i])) s += src[i++];
      const v = Number(s);
      if (Number.isFinite(v)) toks.push({ t: "num", v });
      else toks.push({ t: "op", v: s });
      continue;
    }

    let s = "";
    while (i < n && !WS.has(src[i]) && !DELIM.has(src[i])) s += src[i++];
    if (s) toks.push({ t: "op", v: s });
    else i++;
  }
  return toks;
}

// -------------------------------------------------------------- interpreter

type Matrix = [number, number, number, number, number, number];

const mul = (a: Matrix, b: Matrix): Matrix => [
  a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
  a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5],
];
const apply = (m: Matrix, x: number, y: number): [number, number] => [
  x * m[0] + y * m[2] + m[4], x * m[1] + y * m[3] + m[5],
];
const scaleOf = (m: Matrix) => Math.hypot(m[0], m[1]) || Math.hypot(m[2], m[3]) || 1;

const PAINT_OPS = new Set(["f", "F", "f*", "S", "s", "B", "B*", "b", "b*", "n"]);

const nums = (ops: Token[]) => ops.flatMap((o) => (o.t === "num" ? [o.v] : []));
const strings = (ops: Token[]) => ops.flatMap((o) => (o.t === "str" ? [o.v] : []));

function interpret(src: string, ctx: Ctx, scope: Scope, depth = 0) {
  const { pdf, out, page } = ctx;
  const toks = tokenize(src);
  const operands: Token[] = [];

  let ctm: Matrix = [1, 0, 0, 1, 0, 0];
  const ctmStack: Matrix[] = [];
  let Tm: Matrix = [1, 0, 0, 1, 0, 0];
  let Tlm: Matrix = [1, 0, 0, 1, 0, 0];
  let TL = 0;
  let Tfs = 0;
  let Tz = 1;
  let Tc = 0;
  let fontName = "";
  let subpaths: [number, number][][] = [];

  /** The subpath a line or curve continues, starting one if the path is empty. */
  const tail = () => {
    if (!subpaths.length) subpaths.push([]);
    return subpaths[subpaths.length - 1];
  };

  const show = (pieces: { text?: string; adjust?: number }[]) => {
    let text = "";
    let advance = 0;
    const info = scope.fonts.get(fontName);
    for (const p of pieces) {
      if (p.text !== undefined) {
        text += decode(p.text, info);
        advance += p.text.length * (Tfs * 0.5 + Tc) * Tz; // no font metrics: half an em per code
      } else if (p.adjust) {
        advance -= (p.adjust / 1000) * Tfs * Tz;
      }
    }
    if (text.length) {
      const m = mul(Tm, ctm);
      const [x, y] = apply(m, 0, 0);
      const scale = scaleOf(m);
      out.items.push({ page, x, y, size: Tfs * scale, font: fontName, text, w: advance * scale });
    }
    Tm = mul([1, 0, 0, 1, advance, 0], Tm);
  };

  const paint = (op: string) => {
    if (op !== "n") {
      for (const points of subpaths) {
        if (!points.length) continue;
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const [px, py] of points) {
          const [x, y] = apply(ctm, px, py);
          x0 = Math.min(x0, x); x1 = Math.max(x1, x);
          y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        }
        if (Number.isFinite(x0)) out.ink.push({ page, x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
      }
    }
    subpaths = [];
  };

  for (const tok of toks) {
    if (tok.t !== "op") { operands.push(tok); continue; }
    const op = tok.v;
    // Array and procedure delimiters belong to the operand list, so they must
    // neither be treated as operators nor clear it: a TJ array is the only way
    // these forms show most of their words.
    if (op === "[" || op === "]" || op === "{" || op === "}") continue;
    const args = nums(operands);

    switch (op) {
      case "q": ctmStack.push(ctm); break;
      case "Q": ctm = ctmStack.pop() ?? [1, 0, 0, 1, 0, 0]; break;
      case "cm":
        if (args.length === 6) ctm = mul(args as Matrix, ctm);
        break;
      case "BT": Tm = Tlm = [1, 0, 0, 1, 0, 0]; break;
      case "Tf": {
        const name = operands.find((o) => o.t === "name");
        fontName = name && name.t === "name" ? name.v : "";
        Tfs = args[0] ?? 0;
        break;
      }
      case "Tz": Tz = (args[0] ?? 100) / 100; break;
      case "Tc": Tc = args[0] ?? 0; break;
      case "TL": TL = args[0] ?? 0; break;
      case "Tm": if (args.length === 6) Tm = Tlm = args as Matrix; break;
      case "Td":
        if (args.length === 2) { Tlm = mul([1, 0, 0, 1, args[0], args[1]], Tlm); Tm = Tlm; }
        break;
      case "TD":
        if (args.length === 2) { TL = -args[1]; Tlm = mul([1, 0, 0, 1, args[0], args[1]], Tlm); Tm = Tlm; }
        break;
      case "T*": Tlm = mul([1, 0, 0, 1, 0, -TL], Tlm); Tm = Tlm; break;
      case "Tj":
        show(strings(operands).map((text) => ({ text })));
        break;
      case "'": Tlm = mul([1, 0, 0, 1, 0, -TL], Tlm); Tm = Tlm;
        show(strings(operands).map((text) => ({ text })));
        break;
      case '"':
        if (args.length >= 2) TL = args[0];
        Tlm = mul([1, 0, 0, 1, args[1] ?? 0, -TL], Tlm); Tm = Tlm;
        show(strings(operands).map((text) => ({ text })));
        break;
      case "TJ": {
        // Walk the array in source order so kerning moves the pen correctly.
        const pieces: { text?: string; adjust?: number }[] = [];
        for (const o of operands) {
          if (o.t === "str") pieces.push({ text: o.v });
          else if (o.t === "num") pieces.push({ adjust: o.v });
        }
        show(pieces);
        break;
      }
      case "re":
        if (args.length === 4) {
          const [x, y, w, h] = args;
          subpaths.push([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);
        }
        break;
      case "m":
        if (args.length >= 2) subpaths.push([[args[args.length - 2], args[args.length - 1]]]);
        break;
      case "l":
        if (args.length >= 2) tail().push([args[args.length - 2], args[args.length - 1]]);
        break;
      case "c": case "v": case "y": {
        const pts = tail();
        for (let k = args.length - 2; k >= 0; k -= 2) pts.push([args[k], args[k + 1]]);
        break;
      }
      case "h": break;
      case "Do": {
        // A form XObject: what a flattened form draws its filled values with.
        const name = operands.find((o) => o.t === "name");
        const form = name && name.t === "name" ? formXObject(pdf, scope.xobjects, name.v) : null;
        const inner = form ? decodeStream(form) : null;
        if (form && inner !== null && depth < 8) {
          const matrix = numbersOf(pdf, form.dict.get(PDFName.of("Matrix")));
          // The form draws under the CTM in force where the Do appears, so the
          // recursion has to inherit it rather than start from the identity.
          const pre = `q ${ctm.join(" ")} cm ${matrix.length === 6 ? `${matrix.join(" ")} cm ` : ""}`;
          interpret(`${pre}${inner} Q`, ctx, scopeOf(ctx, form.dict.get(PDFName.of("Resources")), scope), depth + 1);
        }
        break;
      }
      default:
        if (PAINT_OPS.has(op)) paint(op);
        break;
    }
    operands.length = 0;
  }
}

function decode(raw: string, info: FontInfo | undefined): string {
  const map = info?.toUnicode;
  if (info?.twoByte) {
    let out = "";
    for (let i = 0; i + 1 < raw.length; i += 2) {
      const code = (raw.charCodeAt(i) << 8) | raw.charCodeAt(i + 1);
      out += map?.get(code) ?? "";
    }
    return out;
  }
  let out = "";
  for (const ch of raw) {
    const code = ch.charCodeAt(0);
    out += map?.get(code) ?? ch;
  }
  return out;
}

// ------------------------------------------------------------------- helpers

export type Word = { page: number; x: number; y: number; size: number; font: string; text: string; w: number };

/**
 * The extractor reports one entry per show-text operator, so a single word
 * often arrives in pieces ("Sep", "t", "ember"). Join what sits on the same
 * baseline with a small gap between.
 */
export function words(items: TextItem[], gapFactor = 0.5): Word[] {
  const out: Word[] = [];
  const lines = new Map<number, TextItem[]>();
  for (const it of items) {
    const key = it.page * 100000 + Math.round(it.y * 2);
    const line = lines.get(key);
    if (line) line.push(it);
    else lines.set(key, [it]);
  }
  for (const line of lines.values()) {
    line.sort((a, b) => a.x - b.x);
    let current: Word | null = null;
    for (const it of line) {
      const gap = current ? it.x - (current.x + current.w) : Infinity;
      const joinable =
        current &&
        current.font === it.font &&
        !isBoxGlyph(current.text) &&
        !isBoxGlyph(it.text) &&
        gap < it.size * gapFactor;
      if (joinable && current) {
        current.text += it.text;
        current.w = it.x + it.w - current.x;
      } else {
        current = { ...it };
        out.push(current);
      }
    }
  }
  return out.sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);
}

/** A box drawn with a symbol font: the tick boxes on the official forms. */
export function isBoxGlyph(text: string): boolean {
  if (text.length !== 1) return false;
  const c = text.charCodeAt(0);
  return c < 0x21 || (c >= 0x80 && c !== 0xa0) || "□◻☐◼■▢".includes(text);
}

/** Lower case, letters and digits only: how labels are matched. */
export function normalise(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export type Line = {
  page: number;
  /** Baseline of the row. */
  y: number;
  size: number;
  items: TextItem[];
  text: string;
  norm: string;
};

/** Everything printed on one baseline, in reading order. */
export function lines(items: TextItem[], yTol = 2): Line[] {
  const buckets: TextItem[][] = [];
  for (const it of items.slice().sort((a, b) => b.y - a.y)) {
    const bucket = buckets.find((b) => Math.abs(b[0].y - it.y) <= Math.max(yTol, it.size * 0.25));
    if (bucket) bucket.push(it);
    else buckets.push([it]);
  }
  return buckets
    .map((bucket) => {
      bucket.sort((a, b) => a.x - b.x);
      const text = joinItems(bucket);
      return {
        page: bucket[0].page,
        y: bucket[0].y,
        size: Math.max(...bucket.map((i) => i.size)),
        items: bucket,
        text,
        norm: normalise(text),
      };
    })
    .sort((a, b) => a.page - b.page || b.y - a.y);
}

/** Where an item stops, from the pen advance the interpreter measured. */
export function endX(item: TextItem): number {
  return item.x + (item.w || item.text.length * item.size * 0.58);
}

/**
 * The items inside one region of a page, read back as text. A form draws a
 * single value in several pieces with kerning between, so the pieces are
 * joined and a space is left only where the gap is wide enough to be one.
 */
export function joinItems(items: TextItem[]): string {
  let out = "";
  let prev: TextItem | null = null;
  for (const it of items.slice().sort((a, b) => a.x - b.x || a.y - b.y)) {
    if (prev) {
      const gap = it.x - endX(prev);
      if (gap > Math.max(prev.size, it.size) * 0.28) out += " ";
    }
    out += it.text;
    prev = it;
  }
  return out.replace(/\s+/g, " ").trim();
}
