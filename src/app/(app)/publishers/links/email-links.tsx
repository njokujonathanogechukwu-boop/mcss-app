"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

type MailState = { busy: boolean; message: string; tone: "ok" | "error" };

export function EmailLinksButton() {
  const [state, setState] = useState<MailState | null>(null);

  const onClick = async () => {
    if (!window.confirm("Send every publisher who has an email address their personal update link?")) {
      return;
    }
    setState({ busy: true, message: "", tone: "ok" });
    const res = await fetch("/api/self-links/email", { method: "POST" });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data) {
      setState({ busy: false, tone: "error", message: data?.error ?? "The emails could not be sent." });
      return;
    }
    if (!data.configured) {
      setState({
        busy: false,
        tone: "error",
        message: "Email is not set up yet. Add RESEND_API_KEY (Resend) in Vercel first.",
      });
      return;
    }
    const parts = [`Sent ${data.sent} email(s).`, `${data.withoutEmail} publisher(s) have no email on file.`];
    if (data.failed?.length) parts.push(`Failed: ${data.failed.join(" · ")}`);
    setState({ busy: false, tone: data.failed?.length ? "error" : "ok", message: parts.join(" ") });
  };

  return (
    <div className="grid gap-2">
      <Button type="button" variant="secondary" size="sm" disabled={state?.busy} onClick={onClick}>
        {state?.busy ? "Sending…" : "Email every link"}
      </Button>
      {state && !state.busy && (
        <p className={`text-xs ${state.tone === "ok" ? "text-pine-dark" : "text-clay"}`}>{state.message}</p>
      )}
    </div>
  );
}
