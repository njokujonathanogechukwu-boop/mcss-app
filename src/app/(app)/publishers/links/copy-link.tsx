"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

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

export function CopyLinkButton({ url }: { url: string }) {
  const [label, setLabel] = useState("Copy");

  const onClick = async () => {
    const ok = await copyText(url);
    setLabel(ok ? "Copied" : "Select it instead");
    window.setTimeout(() => setLabel("Copy"), 2000);
  };

  return (
    <Button type="button" size="sm" variant="secondary" onClick={onClick}>
      {label}
    </Button>
  );
}
