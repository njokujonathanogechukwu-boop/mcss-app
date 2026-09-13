"use client";

import { useState } from "react";
import { Badge } from "@/components/ui";

/**
 * One group's reminder, ready to paste into whatever the overseer uses.
 * The text is written out in full so the secretary can read it before
 * copying — nothing is sent from here.
 */
export function ReminderCard({
  title,
  meta,
  message,
  hasEmail,
  waHref,
}: {
  title: string;
  meta: string;
  message: string;
  hasEmail: boolean;
  waHref: string | null;
}) {
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
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-ink">{title}</p>
            <Badge tone={hasEmail ? "good" : "warn"}>
              {hasEmail ? "Email on file" : "No email — use WhatsApp"}
            </Badge>
          </div>
          <p className="mt-0.5 text-xs text-ink-faint">{meta}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={copy}
            className="rounded bg-pine px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-pine-dark"
          >
            {copied ? "Copied" : "Copy reminder"}
          </button>
          {waHref && (
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded border border-rule-strong px-2.5 py-1 text-xs text-ink-soft hover:border-pine hover:text-pine"
            >
              Open WhatsApp
            </a>
          )}
        </div>
      </div>
      <pre className="mt-3 whitespace-pre-wrap rounded bg-paper/70 p-3 font-sans text-xs leading-relaxed text-ink-soft">
        {message}
      </pre>
    </div>
  );
}
