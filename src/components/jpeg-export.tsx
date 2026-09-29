"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

/** 2.5 × the PDF's points: an A4 page comes out about 1,490 pixels wide, sharp on a phone. */
const SCALE = 2.5;
const QUALITY = 0.92;

/**
 * A meeting fills about the top third of its A4 page. Shared as a picture, the
 * blank rest is just scrolling, so the page is cut a margin below the last line.
 */
function trimBottom(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D): HTMLCanvasElement {
  const { width, height } = canvas;
  const pixels = context.getImageData(0, 0, width, height).data;
  let last = 0;
  for (let y = height - 1; y >= 0 && last === 0; y--) {
    for (let x = 0, i = y * width * 4; x < width; x++, i += 4) {
      if (pixels[i] < 245 || pixels[i + 1] < 245 || pixels[i + 2] < 245) {
        last = y;
        break;
      }
    }
  }
  const margin = Math.round(24 * SCALE);
  const cut = Math.min(height, last + margin);
  if (last === 0 || cut >= height) return canvas;
  const trimmed = document.createElement("canvas");
  trimmed.width = width;
  trimmed.height = cut;
  trimmed.getContext("2d")?.drawImage(canvas, 0, 0);
  return trimmed;
}

function save(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Saves a printed schedule as pictures, for a WhatsApp group or a noticeboard
 * screen. The PDF the Print button gives is drawn page by page in the browser,
 * so the picture is exactly the printed schedule: one meeting saves as a single
 * JPEG, a whole workbook as a zip with one JPEG per page.
 */
export function JpegExportButton({
  href, label = "Save as JPEG", variant = "secondary", size = "sm",
}: {
  /** The PDF export to draw, e.g. `/api/exports/midweek?week=…`. */
  href: string;
  label?: string;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(href, { cache: "no-store" });
      if (!response.ok) throw new Error((await response.text()) || "The schedule could not be fetched.");
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const base = (/filename="([^"]+)"/.exec(disposition)?.[1] ?? "midweek_schedule.pdf").replace(/\.pdf$/i, "");
      const data = new Uint8Array(await response.arrayBuffer());

      // The worker is loaded on the page itself rather than as a separate
      // worker file: a schedule is a few pages, and it spares the bundler a
      // worker URL it cannot resolve inside a package.
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs");
      const pdf = await pdfjs.getDocument({ data }).promise;

      const images: Blob[] = [];
      for (let number = 1; number <= pdf.numPages; number++) {
        const page = await pdf.getPage(number);
        const viewport = page.getViewport({ scale: SCALE });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("This browser cannot draw the schedule.");
        // A JPEG has no transparency: without a white ground the page turns black.
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: context, viewport }).promise;
        const picture = trimBottom(canvas, context);
        images.push(
          await new Promise<Blob>((resolve, reject) =>
            picture.toBlob(
              (blob) => (blob ? resolve(blob) : reject(new Error("The picture could not be made."))),
              "image/jpeg",
              QUALITY,
            ),
          ),
        );
        page.cleanup();
      }
      await pdf.destroy();

      if (images.length === 1) {
        save(images[0], `${base}.jpg`);
      } else {
        const { default: JSZip } = await import("jszip");
        const zip = new JSZip();
        images.forEach((image, index) => zip.file(`${base}_page${String(index + 1).padStart(2, "0")}.jpg`, image));
        save(await zip.generateAsync({ type: "blob" }), `${base}_jpeg.zip`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "The pictures could not be made.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-end">
      <Button type="button" variant={variant} size={size} disabled={busy} onClick={run}>
        {busy ? "Making JPEG…" : label}
      </Button>
      {error && <span className="mt-1 max-w-xs text-right text-xs text-clay">{error}</span>}
    </span>
  );
}
