"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type NameOption = { value: string; label: string };

/**
 * A dropdown you can type into: the list narrows as you type, and clicking a
 * row (or Enter on the highlighted one) stores its id in a hidden input so
 * ordinary form posts keep working unchanged.
 */
export function NamePicker({
  id,
  name,
  options,
  defaultValue = "",
  placeholder = "Type a name…",
  emptyLabel,
  ariaLabel,
  className = "",
  clearOnSubmit = true,
  onPick,
  history,
}: {
  id: string;
  name: string;
  options: NameOption[];
  defaultValue?: string;
  placeholder?: string;
  emptyLabel?: string;
  ariaLabel?: string;
  className?: string;
  /** Blank the pick once the form posts. Forms that must keep the pick when
   * validation fails (e.g. adding an account) turn this off and reset by
   * remounting instead. */
  clearOnSubmit?: boolean;
  /** Lets a form react to a pick, such as narrowing a paired picker. */
  onPick?: (value: string) => void;
  /** When each name last had something on a schedule and what it was, keyed by
   * its value. Printed under the field once a name is settled on, so the
   * rotation can be read before saving. */
  history?: Record<string, string>;
}) {
  const [selected, setSelected] = useState(defaultValue);
  const [text, setText] = useState(
    () => options.find((o) => o.value === defaultValue)?.label ?? "",
  );
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Once the surrounding form posts, the choice has been sent; blank the field
  // so the next entry starts clean instead of showing the last name.
  useEffect(() => {
    if (!clearOnSubmit) return;
    const form = inputRef.current?.form;
    if (!form) return;
    const clear = () => {
      // Deferred: React snapshots the FormData during this same dispatch, so
      // blanking straight away would post an empty id.
      window.setTimeout(() => {
        setSelected("");
        setText("");
        setOpen(false);
      }, 0);
    };
    form.addEventListener("submit", clear);
    return () => form.removeEventListener("submit", clear);
  }, [clearOnSubmit]);

  // Every word typed has to appear somewhere in the name, in any order, so
  // "Alozie Amaechi" finds Amaechi Alozie as well as "amaechi" or "alo" do.
  const filtered = useMemo(() => {
    const words = text.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return words.length
      ? options.filter((o) => {
          const label = o.label.toLowerCase();
          return words.every((word) => label.includes(word));
        })
      : options;
  }, [options, text]);
  // The whole list, not the first sixty: a congregation's roll with the
  // school's students runs past that, and a name that never shows in the list
  // reads as a name the app does not have.
  const shown = filtered;

  // The name settled on, whether it was picked from the list or typed out:
  // enough to look up what they last handled without waiting for a save.
  const resolved =
    selected ||
    options.find((o) => o.label.toLowerCase() === text.trim().toLowerCase())?.value ||
    (filtered.length === 1 ? filtered[0].value : "");

  function commit(value: string, label: string) {
    setSelected(value);
    setText(label);
    setOpen(false);
    onPick?.(value);
  }

  function reconcile() {
    setOpen(false);
    const q = text.trim().toLowerCase();
    const match =
      options.find((o) => o.label.toLowerCase() === q) ??
      (q && filtered.length === 1 ? filtered[0] : undefined);
    if (match) {
      commit(match.value, match.label);
      return;
    }
    setText(options.find((o) => o.value === selected)?.label ?? "");
  }

  const itemCls = (active: boolean, isCurrent: boolean) =>
    `block w-full px-3 py-1.5 text-left text-sm hover:bg-paper ${
      active ? "bg-paper" : ""
    } ${isCurrent ? "font-medium text-pine" : "text-ink"}`;

  return (
    <div className={`relative ${className}`}>
      <input type="hidden" name={name} value={selected} />
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        autoComplete="off"
        className="field-input"
        placeholder={placeholder}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setSelected("");
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={(e) => {
          setOpen(true);
          e.target.select();
        }}
        onBlur={reconcile}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            if (!open) setOpen(true);
            else setHighlight((h) => Math.min(h + 1, shown.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === "Enter") {
            const pick = shown[highlight];
            if (open && pick) {
              e.preventDefault();
              commit(pick.value, pick.label);
            }
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {history && resolved && (
        <p className="mt-1 text-xxs text-ink-faint" aria-live="polite">
          {history[resolved] ?? "Nothing on a schedule yet — this would be their first."}
        </p>
      )}
      {open && (
        <ul
          id={`${id}-list`}
          role="listbox"
          className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded border border-rule bg-surface shadow-lg"
        >
          {emptyLabel && (
            <li>
              <button
                type="button"
                className={itemCls(false, selected === "")}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commit("", "")}
              >
                <span className="text-ink-faint">{emptyLabel}</span>
              </button>
            </li>
          )}
          {shown.map((o, i) => (
            <li key={o.value}>
              <button
                type="button"
                className={itemCls(i === highlight, o.value === selected)}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => commit(o.value, o.label)}
              >
                {o.label}
              </button>
            </li>
          ))}
          {shown.length === 0 && (
            <li className="px-3 py-2 text-xs text-ink-faint">No match — check the spelling</li>
          )}
        </ul>
      )}
    </div>
  );
}
