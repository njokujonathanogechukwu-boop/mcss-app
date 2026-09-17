"use client";

import { useState, useTransition } from "react";
import { rotateGroupReportLink, type RotateLinkState } from "./actions";

/**
 * The group's own report page, so the secretary can hand the overseer his link
 * at any time — not only when the reminders page lists outstanding publishers.
 */
export function GroupReportLink({ groupId, link }: { groupId: string; link: string }) {
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<RotateLinkState>({});
  const shown = result.link ?? link;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard access can be refused; the link is on screen to copy by hand.
    }
  };

  const replace = () => {
    if (!window.confirm("Replace this link? The one already given out will stop working.")) return;
    startTransition(async () => setResult(await rotateGroupReportLink(groupId)));
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
      {result.error && (
        <p className="mt-3 rounded border border-clay/40 bg-clay-light px-3 py-2 text-xs text-clay">
          {result.error}
        </p>
      )}
      {result.ok && (
        <p className="mt-3 rounded border border-pine/40 bg-pine-light px-3 py-2 text-xs text-pine-dark">
          {result.ok}
        </p>
      )}
      <p className="mt-3 break-all rounded bg-paper/70 p-3 font-mono text-xs text-ink-soft">{shown}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={copy}
          className="rounded bg-pine px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-pine-dark"
        >
          {copied ? "Copied" : "Copy link"}
        </button>
        <a
          href={shown}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded border border-rule-strong px-2.5 py-1 text-xs text-ink-soft hover:border-pine hover:text-pine"
        >
          Open it
        </a>
        <button
          type="button"
          onClick={replace}
          disabled={pending}
          className="rounded border border-rule-strong px-2.5 py-1 text-xs text-ink-soft hover:border-clay hover:text-clay disabled:opacity-50"
        >
          {pending ? "Replacing…" : "Replace this link"}
        </button>
      </div>
    </div>
  );
}
