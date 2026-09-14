"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { TextField, TextArea } from "@/components/fields";
import { SubmitButton, Button } from "@/components/ui";
import { Notice } from "@/components/shell";
import { composeDraft, saveAnnouncement, type FormState } from "./actions";

type Existing = {
  id: string;
  title: string;
  body: string;
  eventDate: string;
  aiDrafted: boolean;
};

/**
 * Composes one announcement. The secretary types the key details and can have
 * the AI gateway draft the wording, then edits it and either saves a draft or
 * finalises it (self-approval). Only the details typed here are sent to the
 * model — no publisher records.
 */
export function AnnouncementComposer({
  existing,
  aiEnabled,
  canApprove,
}: {
  existing?: Existing;
  aiEnabled: boolean;
  canApprove: boolean;
}) {
  const [state, action] = useActionState<FormState, FormData>(saveAnnouncement, {});
  const [title, setTitle] = useState(existing?.title ?? "");
  const [eventDate, setEventDate] = useState(existing?.eventDate ?? "");
  const [body, setBody] = useState(existing?.body ?? "");
  const [details, setDetails] = useState("");
  const [aiDrafted, setAiDrafted] = useState(existing?.aiDrafted ?? false);
  const [aiBusy, startAi] = useTransition();
  const [aiError, setAiError] = useState<string | null>(null);

  const draft = () => {
    setAiError(null);
    startAi(async () => {
      const result = await composeDraft({ title, eventDate, details });
      if (result.ok) {
        setBody(result.text);
        setAiDrafted(true);
      } else {
        setAiError(result.error);
      }
    });
  };

  const e = state.errors ?? {};

  return (
    <form action={action} className="space-y-6">
      {state.error && <Notice tone="error">{state.error}</Notice>}

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Title" name="title" required value={title}
          onChange={(ev) => setTitle(ev.target.value)}
          placeholder="Special public talk this weekend" error={e.title}
        />
        <TextField
          label="Date it is for" name="eventDate" type="date" value={eventDate}
          onChange={(ev) => setEventDate(ev.target.value)} error={e.eventDate}
        />
      </div>

      {aiEnabled && (
        <fieldset className="rounded border border-rule bg-paper/60 p-4">
          <legend className="px-1 text-xs font-medium uppercase tracking-wide text-ink-soft">
            Draft with AI
          </legend>
          <TextArea
            label="Key details" name="details" rows={3} value={details}
            onChange={(ev) => setDetails(ev.target.value)}
            hint="What, when, where and who — the facts the announcement must carry. The AI writes the wording from these only."
          />
          <div className="mt-3 flex items-center gap-3">
            <Button type="button" variant="secondary" size="sm" onClick={draft} disabled={aiBusy}>
              {aiBusy ? "Drafting…" : "Draft it"}
            </Button>
            <span className="text-xs text-ink-faint">
              Fills the announcement below. Check it before it is read out.
            </span>
          </div>
          {aiError && <p className="field-error mt-2">{aiError}</p>}
        </fieldset>
      )}

      <div>
        <TextArea
          label="Announcement" name="body" rows={6} required value={body}
          onChange={(ev) => {
            setBody(ev.target.value);
            setAiDrafted(false);
          }}
          error={e.body}
          hint={aiDrafted ? "Drafted by AI — read it over before approving." : "What will be read to the congregation."}
        />
        {aiDrafted && <p className="mt-1 text-xs text-[#7A5E1E]">AI-drafted — please review.</p>}
      </div>

      <input type="hidden" name="id" value={existing?.id ?? ""} />
      <input type="hidden" name="aiDrafted" value={aiDrafted ? "true" : "false"} />

      <div className="flex flex-wrap items-center gap-2 border-t border-rule pt-5">
        <SubmitButton name="intent" value="DRAFT" variant="secondary" pendingLabel="Saving…">
          Save as draft
        </SubmitButton>
        {canApprove && (
          <SubmitButton name="intent" value="APPROVED" pendingLabel="Approving…">
            {existing ? "Save and approve" : "Approve"}
          </SubmitButton>
        )}
        <Link href="/tasks">
          <Button variant="ghost" type="button">Cancel</Button>
        </Link>
      </div>
    </form>
  );
}
