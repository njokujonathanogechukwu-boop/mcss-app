"use client";

import { Fragment, useEffect, useActionState, useState } from "react";
import Link from "next/link";
import { Td } from "@/components/shell";
import { Badge, Button } from "@/components/ui";
import { quickUpdatePublisher, type FormState } from "./actions";

export type RowPublisher = {
  id: string;
  name: string;
  groupLabel: string | null;
  genderLabel: string;
  gender: string;
  appointment: string;
  pioneer: string;
  baptized: boolean;
  baptizedLabel: string;
  baptismDateInput: string;
  phone: string | null;
  statusLabel: string;
  statusTone: "good" | "warn" | "bad" | "neutral";
};

/**
 * One publishers-list row. Client component so the secretary can fix sex and
 * baptism details in place, without opening each record.
 */
export function PublisherRow({
  p,
  showContact,
  canWrite,
  colSpan,
}: {
  p: RowPublisher;
  showContact: boolean;
  canWrite: boolean;
  colSpan: number;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    quickUpdatePublisher.bind(null, p.id),
    {},
  );

  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state]);

  return (
    <Fragment>
      <tr className="hover:bg-paper">
        <Td>
          <Link href={`/publishers/${p.id}`} className="font-medium text-ink hover:text-pine hover:underline">
            {p.name}
          </Link>
        </Td>
        <Td className="text-ink-soft">
          {p.groupLabel ?? <span className="text-ink-faint">—</span>}
        </Td>
        <Td className="text-ink-soft">{p.genderLabel}</Td>
        <Td className="text-ink-soft">{p.appointment}</Td>
        <Td className="text-ink-soft">{p.pioneer}</Td>
        <Td className="text-ink-soft">
          {p.baptized ? p.baptizedLabel : <Badge tone="neutral">Unbaptized</Badge>}
        </Td>
        {showContact && <Td className="text-ink-soft">{p.phone ?? "—"}</Td>}
        <Td align="right">
          <Badge tone={p.statusTone}>{p.statusLabel}</Badge>
        </Td>
        {canWrite && (
          <Td align="right">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>
              {open ? "Close" : "Edit"}
            </Button>
          </Td>
        )}
      </tr>
      {open && (
        <tr className="bg-paper">
          <td
            colSpan={colSpan}
            className="border-b border-rule px-3 py-3"
          >
            <form action={formAction} className="grid items-end gap-3 sm:grid-cols-[9rem_7rem_10rem_auto]">
              <div>
                <label htmlFor={`sex-${p.id}`} className="field-label">Sex</label>
                <select id={`sex-${p.id}`} name="gender" defaultValue={p.gender} className="field-input">
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                </select>
              </div>
              <div>
                <span className="field-label">Baptized</span>
                <label className="flex h-9 items-center gap-2 text-sm text-ink-soft">
                  <input type="checkbox" name="isBaptized" defaultChecked={p.baptized} className="h-4 w-4" />
                  Yes
                </label>
              </div>
              <div>
                <label htmlFor={`baptism-${p.id}`} className="field-label">Baptism date</label>
                <input
                  id={`baptism-${p.id}`}
                  type="date"
                  name="baptismDate"
                  defaultValue={p.baptismDateInput}
                  className="field-input"
                />
              </div>
              <div className="flex items-center gap-2">
                <Button type="submit" size="sm" disabled={pending}>Save</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                {state?.ok && <span className="text-xs text-pine">{state.ok}</span>}
              </div>
              {(state?.error || state?.errors) && (
                <p className="sm:col-span-4 text-xs text-clay">
                  {state.error ?? Object.values(state.errors ?? {})[0]}
                </p>
              )}
            </form>
          </td>
        </tr>
      )}
    </Fragment>
  );
}
