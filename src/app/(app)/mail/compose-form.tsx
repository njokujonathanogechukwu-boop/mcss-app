"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { SubmitButton } from "@/components/ui";
import { Notice } from "@/components/shell";
import { splitAddresses, isEmailAddress } from "@/lib/mail-addresses";
import { sendMail, type MailState } from "./actions";

const AUDIENCES = [
  { value: "manual", label: "Addresses I type" },
  { value: "group", label: "One service group" },
  { value: "all", label: "Every publisher with an email address" },
];

/**
 * Composes one message and sends it to the chosen audience. Fields are
 * controlled so a failed send keeps what was typed; the form blanks only after
 * everything has gone out.
 */
export function ComposeForm({
  groups, congregation, withoutEmail, initialSubject, initialBody, kind,
}: {
  groups: { value: string; label: string; members: number }[];
  congregation: number;
  withoutEmail: number;
  initialSubject?: string;
  initialBody?: string;
  kind?: "GENERAL" | "ANNOUNCEMENT";
}) {
  const [state, action] = useActionState<MailState, FormData>(sendMail, {});
  const [audience, setAudience] = useState("manual");
  const [addresses, setAddresses] = useState("");
  const [groupId, setGroupId] = useState(groups[0]?.value ?? "");
  const [subject, setSubject] = useState(initialSubject ?? "");
  const [body, setBody] = useState(initialBody ?? "");
  const [saved, setSaved] = useState(0);
  useEffect(() => {
    if (state.ok) setSaved((n) => n + 1);
  }, [state]);

  const typed = useMemo(() => splitAddresses(addresses), [addresses]);
  const badAddresses = audience === "manual" ? typed.filter((a) => !isEmailAddress(a)) : [];
  const group = groups.find((g) => g.value === groupId);

  const count =
    audience === "manual"
      ? typed.length - badAddresses.length
      : audience === "group"
        ? (group?.members ?? 0)
        : congregation;
  const who = `${count} ${count === 1 ? "person" : "people"}`;

  const reach =
    audience === "manual"
      ? badAddresses.length
        ? `${who} ready · ${badAddresses.length} not an address yet`
        : `${who} ready to go`
      : audience === "group"
        ? group
          ? `${group.label} · ${who} with an email address`
          : "Choose a group"
        : `${who} on the roll have an email address` +
          (withoutEmail ? ` · ${withoutEmail} have none` : "");

  return (
    <form
      key={saved}
      action={action}
      className="space-y-4 rounded border border-rule bg-surface p-5"
      onSubmit={(e) => {
        if (audience !== "manual" && !window.confirm(`Send "${subject || "this message"}" to ${who}?`)) {
          e.preventDefault();
        }
      }}
    >
      {kind === "ANNOUNCEMENT" && (
        <p className="text-xs text-ink-soft">
          This announcement was filled in for you. Check it, choose who should get it, and send.
        </p>
      )}
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.ok && <Notice tone="success">{state.ok}</Notice>}

      <input type="hidden" name="kind" value={kind ?? "GENERAL"} />

      <div>
        <span className="field-label">Who gets this</span>
        <div className="grid gap-2 sm:grid-cols-3">
          {AUDIENCES.map((a) => (
            <label
              key={a.value}
              className={`flex cursor-pointer items-start gap-2 rounded border px-3 py-2 text-sm transition-colors ${
                audience === a.value ? "border-pine bg-pine-light text-pine-dark" : "border-rule hover:bg-paper"
              }`}
            >
              <input
                type="radio"
                name="audience"
                value={a.value}
                checked={audience === a.value}
                onChange={() => setAudience(a.value)}
                className="mt-0.5 h-3.5 w-3.5 border-rule-strong text-pine focus:ring-pine"
              />
              {a.label}
            </label>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-ink-faint">
          {audience === "manual"
            ? "Separate addresses with commas, spaces or line breaks."
            : "Each person gets their own email; nobody sees the other addresses."}
        </p>
      </div>

      {audience === "manual" && (
        <div>
          <label htmlFor="addresses" className="field-label">Email addresses</label>
          <textarea
            id="addresses" name="addresses" rows={2} className="field-input"
            value={addresses} onChange={(e) => setAddresses(e.target.value)}
            placeholder="brother@example.org, sister@example.org"
          />
          {state.errors?.addresses
            ? <p className="field-error">{state.errors.addresses}</p>
            : badAddresses.length > 0
              ? <p className="field-hint text-clay">Not an address yet: {badAddresses.slice(0, 3).join(", ")}</p>
              : <p className="field-hint">{reach}</p>}
        </div>
      )}

      {audience === "group" && (
        <div>
          <label htmlFor="groupId" className="field-label">Service group</label>
          <select
            id="groupId" name="groupId" className="field-input max-w-md"
            value={groupId} onChange={(e) => setGroupId(e.target.value)}
          >
            {groups.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label} ({g.members} with email)
              </option>
            ))}
          </select>
          {state.errors?.groupId
            ? <p className="field-error">{state.errors.groupId}</p>
            : <p className="field-hint">{reach}</p>}
        </div>
      )}

      {audience === "all" && (
        <p className="rounded border border-wheat/30 bg-wheat-light px-3 py-2 text-xs text-[#7A5E1E]">
          {reach}. A Gmail sending account is allowed about 500 recipients a day, so one
          congregation-wide mail still leaves room for the reminders and update links that go out the
          same day. On Resend&rsquo;s free tier the cap is 100 a day instead.
        </p>
      )}

      <div>
        <label htmlFor="subject" className="field-label">Subject</label>
        <input
          id="subject" name="subject" required className="field-input"
          value={subject} onChange={(e) => setSubject(e.target.value)}
          placeholder="Meeting this week"
        />
        {state.errors?.subject && <p className="field-error">{state.errors.subject}</p>}
      </div>

      <div>
        <label htmlFor="body" className="field-label">Message</label>
        <textarea
          id="body" name="body" rows={9} required className="field-input font-mono text-xs"
          value={body} onChange={(e) => setBody(e.target.value)}
          placeholder={"Dear brother and sister,\n\n…"}
        />
        {state.errors?.body
          ? <p className="field-error">{state.errors.body}</p>
          : <p className="field-hint">Plain text. Line breaks are kept as you type them.</p>}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-rule pt-4">
        <SubmitButton pendingLabel="Sending…">Send to {who}</SubmitButton>
        <span className="text-xs text-ink-faint">One click sends it once; every message is listed below.</span>
      </div>
    </form>
  );
}
