"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

export type FormMemory = Record<string, string[]>;

/**
 * Remembers what has been typed into a form in this browser, so a page left
 * half filled, a refresh, or a save that is refused does not lose the entry.
 *
 * The form stays uncontrolled: every field reads its starting value through
 * `value(name, fallback)`, and the form is remounted (`formKey`) whenever the
 * remembered entry is put back. React resets a form once its action returns,
 * whether or not the save went through, so the caller calls `restore()` when
 * it was refused and `forget()` once it was saved.
 *
 * Fields named in `ignore` (hidden ids, a status kept in step elsewhere) are
 * not counted when deciding whether anything worth keeping was typed.
 */
export function useFormMemory(storageKey: string, ignore: string[] = []) {
  const [memory, setMemory] = useState<FormMemory | null>(null);
  const [formKey, setFormKey] = useState(0);
  const latest = useRef<FormMemory | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ignored = useRef(ignore);

  // Read after mounting, so the page the server sent and the first render agree.
  useEffect(() => {
    let saved: FormMemory | null = null;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (parsed && typeof parsed === "object") saved = parsed as FormMemory;
      }
    } catch {
      saved = null;
    }
    if (saved) {
      latest.current = saved;
      setMemory(saved);
      setFormKey((k) => k + 1);
    }
  }, [storageKey]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const capture = useCallback(
    (form: HTMLFormElement) => {
      const data: FormMemory = {};
      for (const [name, value] of new FormData(form)) {
        if (typeof value !== "string") continue;
        (data[name] ??= []).push(value);
      }
      const typed = Object.entries(data).some(
        ([name, values]) => !ignored.current.includes(name) && values.some((v) => v.trim() !== ""),
      );
      latest.current = typed ? data : null;
      try {
        if (typed) window.localStorage.setItem(storageKey, JSON.stringify(data));
        else window.localStorage.removeItem(storageKey);
      } catch {
        // Storage may be blocked (a private window); the entry is then kept only until the page closes.
      }
    },
    [storageKey],
  );

  /** Spread on the <form>: notes every change, including names added or removed with a button. */
  const track = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      const form = e.currentTarget;
      if (timer.current) clearTimeout(timer.current);
      // Wait a tick so a row added or removed has rendered before it is read.
      timer.current = setTimeout(() => capture(form), 0);
    },
    [capture],
  );

  /** Puts the last entry back into the form, after a refused save has reset it. */
  const restore = useCallback(() => {
    setMemory(latest.current);
    setFormKey((k) => k + 1);
  }, []);

  /** Drops the remembered entry and empties the form, once it has been saved or discarded. */
  const forget = useCallback(() => {
    latest.current = null;
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // Nothing was stored.
    }
    setMemory(null);
    setFormKey((k) => k + 1);
  }, [storageKey]);

  const value = useCallback(
    (name: string, fallback = "") => memory?.[name]?.[0] ?? fallback,
    [memory],
  );
  const values = useCallback(
    (name: string, fallback: string[] = []) => {
      const v = memory?.[name]?.filter((s) => s.trim() !== "");
      return v && v.length ? v : fallback;
    },
    [memory],
  );

  return {
    /** True when the form is showing an entry put back from this browser's memory. */
    restored: memory !== null,
    memory,
    formKey,
    formProps: { onInput: track, onChange: track, onClick: track },
    value,
    values,
    restore,
    forget,
  };
}
