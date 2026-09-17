"use client";

import { useState } from "react";

/**
 * The group's own report page, so the secretary can hand the overseer his link
 * at any time — not only when the reminders page lists outstanding publishers.
 */
export function GroupReportLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard access can be refused; the link is on screen to copy by hand.
    }
  };

  return (
    <div className="rounded border border-rule bg-surface p-4">
      <p className="text-sm font-medium text-ink">Report link for this group</p>
      <p className="mt-0.5 text-xs text-ink-faint">
        Send this to the field service overseer. He can read back over his group&rsquo;s reports and
        fill in the ones still missing for the month being collected &mdash; no account needed.
        Anything you have already entered is shown to him but cannot be changed. Anyone holding the
        link can send reports for this group, so please do not post it where others can see it.
      </p>
      <p className="mt-3 break-all rounded bg-paper/70 p-3 font-mono text-xs text-ink-soft">{link}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={copy}
          className="rounded bg-pine px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-pine-dark"
        >
          {copied ? "Copied" : "Copy link"}
        </button>
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded border border-rule-strong px-2.5 py-1 text-xs text-ink-soft hover:border-pine hover:text-pine"
        >
          Open it
        </a>
      </div>
    </div>
  );
}
