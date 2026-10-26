"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Button, SubmitButton } from "@/components/ui";
import { Notice } from "@/components/shell";
import { saveReshuffle, type ReshuffleState } from "./actions";

export type BoardGroup = { id: string; number: number; label: string; overseerId: string; assistantId: string };
export type BoardPerson = { id: string; name: string; groupId: string; note: string | null };

const NONE = "";

/**
 * Every group side by side, with its members. A publisher is moved with the
 * menu on their name, or several at once by ticking them and choosing where
 * they go; counts and the moves so far update as you go, and nothing is saved
 * until "Save" is pressed.
 */
export function ReshuffleBoard({
  groups, people, leaders, today,
}: {
  groups: BoardGroup[];
  people: BoardPerson[];
  /** Brothers who may oversee or assist a group. */
  leaders: { id: string; name: string }[];
  today: string;
}) {
  const [state, action] = useActionState<ReshuffleState, FormData>(saveReshuffle, {});
  const original = useMemo(() => Object.fromEntries(people.map((p) => [p.id, p.groupId])), [people]);
  const [where, setWhere] = useState<Record<string, string>>(original);
  const [heads, setHeads] = useState<Record<string, { overseerId: string; assistantId: string }>>(
    () => Object.fromEntries(groups.map((g) => [g.id, { overseerId: g.overseerId, assistantId: g.assistantId }])),
  );
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState(groups[0]?.id ?? NONE);
  const [filter, setFilter] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(today);
  const [reason, setReason] = useState("Group reshuffle");

  // A saved reshuffle is the new starting point.
  useEffect(() => {
    if (state.ok) {
      setTicked(new Set());
    }
  }, [state]);
  useEffect(() => {
    setWhere(original);
  }, [original]);
  useEffect(() => {
    setHeads(Object.fromEntries(groups.map((g) => [g.id, { overseerId: g.overseerId, assistantId: g.assistantId }])));
  }, [groups]);

  const groupName = (id: string) => groups.find((g) => g.id === id)?.label ?? "No group";
  const moves = people.filter((p) => where[p.id] !== original[p.id]);
  const headChanges = groups.filter(
    (g) => heads[g.id]?.overseerId !== g.overseerId || heads[g.id]?.assistantId !== g.assistantId,
  );
  const changes = moves.length + headChanges.length;
  const q = filter.trim().toLowerCase();

  const move = (ids: string[], to: string) =>
    setWhere((w) => ({ ...w, ...Object.fromEntries(ids.map((id) => [id, to])) }));
  const toggle = (id: string) =>
    setTicked((t) => {
      const next = new Set(t);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const columns = [...groups.map((g) => ({ id: g.id, label: g.label, group: g })), { id: NONE, label: "No group", group: null }];

  return (
    <form action={action} className="space-y-4">
      <input
        type="hidden"
        name="payload"
        value={JSON.stringify({
          moves: Object.fromEntries(moves.map((p) => [p.id, where[p.id]])),
          leaders: Object.fromEntries(headChanges.map((g) => [g.id, heads[g.id]])),
          effectiveDate,
          reason,
        })}
      />

      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.ok && <Notice tone="success">{state.ok}</Notice>}

      <div className="sticky top-0 z-10 flex flex-wrap items-end gap-3 rounded border border-rule bg-surface/95 p-3 backdrop-blur">
        <label className="block">
          <span className="field-label">Takes effect</span>
          <input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} className="field-input py-1" />
        </label>
        <label className="block min-w-[12rem] flex-1">
          <span className="field-label">Reason, on each publisher&rsquo;s record</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} className="field-input py-1" />
        </label>
        <label className="block min-w-[10rem]">
          <span className="field-label">Find a name</span>
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Type to highlight" className="field-input py-1" />
        </label>
        <div className="flex items-center gap-2">
          <SubmitButton pendingLabel="Saving…" disabled={changes === 0}>
            {changes === 0 ? "No changes yet" : `Save ${moves.length} move${moves.length === 1 ? "" : "s"}${headChanges.length ? ` and ${headChanges.length} overseer change${headChanges.length === 1 ? "" : "s"}` : ""}`}
          </SubmitButton>
          {changes > 0 && (
            <Button
              type="button" variant="ghost" size="sm"
              onClick={() => {
                setWhere(original);
                setHeads(Object.fromEntries(groups.map((g) => [g.id, { overseerId: g.overseerId, assistantId: g.assistantId }])));
                setTicked(new Set());
              }}
            >
              Undo all
            </Button>
          )}
        </div>
        {ticked.size > 0 && (
          <div className="flex w-full flex-wrap items-center gap-2 border-t border-rule pt-2 text-sm">
            <span className="font-medium text-ink">{ticked.size} ticked —</span>
            <span className="text-ink-soft">move them to</span>
            <select value={target} onChange={(e) => setTarget(e.target.value)} className="field-input w-auto py-1">
              {columns.map((c) => <option key={c.id || "none"} value={c.id}>{c.label}</option>)}
            </select>
            <Button type="button" size="sm" onClick={() => { move([...ticked], target); setTicked(new Set()); }}>
              Move
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setTicked(new Set())}>Clear ticks</Button>
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {columns.map((col) => {
          const members = people.filter((p) => where[p.id] === col.id);
          if (col.id === NONE && members.length === 0) return null;
          const before = people.filter((p) => original[p.id] === col.id).length;
          const diff = members.length - before;
          return (
            <section key={col.id || "none"} className="rounded border border-rule bg-surface">
              <header className="border-b border-rule px-3 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-serif text-base text-ink">{col.label}</h3>
                  <span className="text-xs text-ink-soft">
                    {members.length}
                    {diff !== 0 && <span className={diff > 0 ? "text-pine-dark" : "text-clay"}> ({diff > 0 ? `+${diff}` : diff})</span>}
                  </span>
                </div>
                {col.group && (
                  <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                    {(["overseerId", "assistantId"] as const).map((field) => (
                      <select
                        key={field}
                        aria-label={`${col.label} ${field === "overseerId" ? "overseer" : "assistant"}`}
                        value={heads[col.id]?.[field] ?? ""}
                        onChange={(e) => setHeads((h) => ({ ...h, [col.id]: { ...h[col.id], [field]: e.target.value } }))}
                        className={`w-full rounded border px-1.5 py-1 text-xxs ${
                          heads[col.id]?.[field] !== col.group![field] ? "border-pine bg-pine-light" : "border-rule-strong bg-surface"
                        }`}
                      >
                        <option value="">{field === "overseerId" ? "No overseer" : "No assistant"}</option>
                        {leaders.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                      </select>
                    ))}
                  </div>
                )}
              </header>
              <ul className="max-h-[28rem] divide-y divide-rule overflow-auto">
                {members.map((p) => {
                  const moved = where[p.id] !== original[p.id];
                  const hit = q && p.name.toLowerCase().includes(q);
                  return (
                    <li
                      key={p.id}
                      className={`flex items-center gap-2 px-3 py-1.5 text-sm ${moved ? "bg-pine-light" : ""} ${hit ? "ring-2 ring-inset ring-wheat" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={ticked.has(p.id)}
                        onChange={() => toggle(p.id)}
                        aria-label={`Tick ${p.name}`}
                        className="h-3.5 w-3.5 rounded-sm border-rule-strong text-pine focus:ring-pine"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-ink">{p.name}</span>
                        {(moved || p.note) && (
                          <span className="block text-xxs text-ink-faint">
                            {moved ? `from ${groupName(original[p.id])}` : p.note}
                          </span>
                        )}
                      </span>
                      <select
                        aria-label={`Move ${p.name}`}
                        value={where[p.id]}
                        onChange={(e) => move([p.id], e.target.value)}
                        className="w-24 shrink-0 rounded border border-rule-strong bg-surface px-1 py-0.5 text-xxs"
                      >
                        {columns.map((c) => <option key={c.id || "none"} value={c.id}>{c.label}</option>)}
                      </select>
                    </li>
                  );
                })}
                {members.length === 0 && <li className="px-3 py-3 text-xs text-ink-faint">Nobody yet.</li>}
              </ul>
            </section>
          );
        })}
      </div>
    </form>
  );
}
