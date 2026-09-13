"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { revealLink } from "./actions";

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

export function CopyLinkButton({ publisherId }: { publisherId: string }) {
  const [label, setLabel] = useState("Copy link");

  const onClick = async () => {
    setLabel("Working…");
    const result = await revealLink(publisherId);
    if (result.error) {
      setLabel("Copy link");
      window.alert(result.error);
      return;
    }
    const ok = await copyText(result.url!);
    setLabel(ok ? "Copied" : "Copy failed");
    window.setTimeout(() => setLabel("Copy link"), 2000);
  };

  return (
    <Button type="button" size="sm" variant="secondary" onClick={onClick}>
      {label}
    </Button>
  );
}
