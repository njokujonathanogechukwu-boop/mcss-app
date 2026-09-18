"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { Td } from "@/components/shell";
import { rotatePublisherLink } from "../actions";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older phones and non-https previews have no async clipboard API.
    const box = document.createElement("textarea");
    box.value = text;
    box.style.position = "fixed";
    box.style.opacity = "0";
    document.body.appendChild(box);
    box.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(box);
    return ok;
  }
}

/**
 * One publisher's row on the links page. It holds the link itself so that
 * replacing it swaps in the new one straight away — copying the row after a
 * replacement must never hand out the dead link.
 */
export function PublisherLinkRow({
  publisherId,
  name,
  group,
  url,
}: {
  publisherId: string;
  name: string;
  group: string;
  url: string;
}) {
  const [current, setCurrent] = useState(url);
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  const copy = async () => {
    const ok = await copyText(current);
    setCopied(ok);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const replace = () => {
    const sure = window.confirm(
      `Replace ${name}'s link? The one already sent to them stops working at once.`,
    );
    if (!sure) return;
    setNote(null);
    startTransition(async () => {
      const result = await rotatePublisherLink(publisherId);
      if (result.link) setCurrent(result.link);
      setNote({ text: result.error ?? result.ok ?? "Nothing changed.", bad: Boolean(result.error) });
    });
  };

  return (
    <tr className="hover:bg-paper">
      <Td className="font-medium whitespace-nowrap">{name}</Td>
      <Td className="text-ink-soft whitespace-nowrap">{group}</Td>
      <Td>
        <input
          readOnly
          value={current}
          onFocus={(e) => e.currentTarget.select()}
          aria-label={`Update link for ${name}`}
          className="field-input w-full min-w-[16rem] font-mono text-xs"
        />
        {note && (
          <p className={`mt-1 text-xs ${note.bad ? "text-clay" : "text-pine-dark"}`}>{note.text}</p>
        )}
      </Td>
      <Td align="right">
        <span className="flex justify-end gap-1.5 whitespace-nowrap">
          <Button type="button" size="sm" variant="secondary" onClick={copy}>
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={replace} disabled={pending}>
            {pending ? "Replacing…" : "Replace"}
          </Button>
        </span>
      </Td>
    </tr>
  );
}
