"use client";

import { useState } from "react";

/**
 * The month's reporting status for the congregation's general group: how many
 * are still to report in each group, no names. Copy it, or open WhatsApp with
 * it filled in and choose the chat there.
 */
export function StatusCard({ message }: { message: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard access can be refused; the text is on screen to copy by hand.
    }
  };

  return (
    <div className="rounded border border-rule bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-ink">Status for the general group</p>
          <p className="mt-0.5 text-xs text-ink-faint">
            Counts only, no names — safe to post where everyone reads it.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={copy}
            className="rounded bg-pine px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-pine-dark"
          >
            {copied ? "Copied" : "Copy status"}
          </button>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(message)}`}
            target="_blank"
            rel="noopener"
            className="rounded border border-rule-strong bg-surface px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:bg-paper"
          >
            WhatsApp
          </a>
        </div>
      </div>
      <pre className="mt-3 whitespace-pre-wrap rounded bg-paper p-3 font-sans text-sm text-ink">{message}</pre>
    </div>
  );
}
