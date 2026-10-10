"use client";

import { useId, useState } from "react";

/**
 * The brothers assigned to a decision, one name a line. The congregation's
 * elders and ministerial servants are suggested as a name is typed, but any
 * name may be written — at a joint meeting some of those assigned belong to the
 * other congregations at the hall. Every line posts under the same name.
 */
export function AssigneesField({
  name, suggestions, defaultNames = [], label = "Assigned to",
}: {
  name: string;
  suggestions: string[];
  defaultNames?: string[];
  label?: string;
}) {
  const listId = useId();
  const [lines, setLines] = useState(() =>
    (defaultNames.length ? defaultNames : [""]).map((value, key) => ({ key, value })),
  );
  const [next, setNext] = useState(lines.length);

  const add = () => {
    setLines((l) => [...l, { key: next, value: "" }]);
    setNext((n) => n + 1);
  };
  const remove = (key: number) =>
    setLines((l) => (l.length > 1 ? l.filter((x) => x.key !== key) : [{ key: l[0].key, value: "" }]));

  return (
    <div>
      <span className="field-label">{label}</span>
      <datalist id={listId}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <div className="space-y-2">
        {lines.map((line, i) => (
          <div key={line.key} className="flex items-center gap-2">
            <input
              name={name}
              list={listId}
              value={line.value}
              onChange={(e) =>
                setLines((l) => l.map((x) => (x.key === line.key ? { ...x, value: e.target.value } : x)))
              }
              placeholder={i === 0 ? "Type a name…" : "Another name…"}
              aria-label={`${label} ${i + 1}`}
              autoComplete="off"
              className="field-input"
            />
            {(lines.length > 1 || line.value) && (
              <button
                type="button"
                onClick={() => remove(line.key)}
                className="shrink-0 text-xs text-ink-faint hover:text-clay"
                aria-label={`Remove ${line.value || "this name"}`}
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
      <button type="button" onClick={add} className="mt-1.5 text-xs text-pine hover:underline">
        + Add another name
      </button>
      <p className="field-hint">The congregation&rsquo;s elders and ministerial servants are suggested; any other name may be typed.</p>
    </div>
  );
}
