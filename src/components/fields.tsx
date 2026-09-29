"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { NamePicker } from "@/components/name-picker";

/**
 * React resets a form once its action returns. A reset puts every select back
 * on its first option and every box back to how the page loaded, whatever the
 * controlled value says, and the next save then posts what the reset left: a
 * Bible study saved as a talk, a mail sent to the first group in the list. The
 * returned ref puts the field back in step right after the reset.
 */
export function useRestoreAfterReset<T extends HTMLElement>(restore: (el: T) => void) {
  const latest = useRef(restore);
  useEffect(() => {
    latest.current = restore;
  });
  return useCallback((el: T | null) => {
    if (!el) return;
    const form = el instanceof HTMLFormElement ? el : (el as unknown as { form: HTMLFormElement | null }).form;
    if (!form) return;
    // The reset event fires before the reset itself, so the restore waits a tick.
    const onReset = () => setTimeout(() => latest.current(el));
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);
}

type Base = { label: string; name: string; hint?: string; error?: string; required?: boolean };

function Wrapper({
  label, name, hint, error, children,
}: Base & { children: ReactNode }) {
  return (
    <div>
      <label htmlFor={name} className="field-label">
        {label}
      </label>
      {children}
      {error ? <p className="field-error">{error}</p> : hint ? <p className="field-hint">{hint}</p> : null}
    </div>
  );
}

export function TextField({
  label, name, hint, error, required, type = "text", ...props
}: Base & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Wrapper label={label} name={name} hint={hint} error={error}>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        aria-invalid={error ? true : undefined}
        className="field-input"
        {...props}
      />
    </Wrapper>
  );
}

export function TextArea({
  label, name, hint, error, rows = 3, ...props
}: Base & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Wrapper label={label} name={name} hint={hint} error={error}>
      <textarea id={name} name={name} rows={rows} className="field-input" {...props} />
    </Wrapper>
  );
}

export function SelectField({
  label, name, hint, error, options, placeholder, ...props
}: Base & {
  options: { value: string; label: string }[];
  placeholder?: string;
} & React.SelectHTMLAttributes<HTMLSelectElement>) {
  const keep = useRestoreAfterReset<HTMLSelectElement>((el) => {
    if (props.value !== undefined) el.value = String(props.value);
  });
  return (
    <Wrapper label={label} name={name} hint={hint} error={error}>
      <select ref={keep} id={name} name={name} className="field-input" {...props}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Wrapper>
  );
}

export function NameField({
  label, name, hint, error, options, defaultValue, placeholder, emptyLabel, clearOnSubmit, history,
}: Base & {
  options: { value: string; label: string }[];
  defaultValue?: string;
  placeholder?: string;
  emptyLabel?: string;
  clearOnSubmit?: boolean;
  history?: Record<string, string>;
}) {
  return (
    <Wrapper label={label} name={name} hint={hint} error={error}>
      <NamePicker
        id={name}
        name={name}
        options={options}
        defaultValue={defaultValue}
        placeholder={placeholder}
        emptyLabel={emptyLabel}
        clearOnSubmit={clearOnSubmit}
        history={history}
      />
    </Wrapper>
  );
}

export function CheckField({
  label, name, hint, defaultChecked, ...props
}: { label: string; name: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const keep = useRestoreAfterReset<HTMLInputElement>((el) => {
    if (props.checked !== undefined) el.checked = Boolean(props.checked);
  });
  return (
    <label htmlFor={name} className="flex items-start gap-2.5 py-1.5">
      <input
        ref={keep}
        id={name}
        name={name}
        type="checkbox"
        value="true"
        defaultChecked={defaultChecked}
        className="mt-0.5 h-4 w-4 rounded-sm border-rule-strong text-pine focus:ring-pine"
        {...props}
      />
      <span>
        <span className="text-sm text-ink">{label}</span>
        {hint && <span className="block text-xs text-ink-faint">{hint}</span>}
      </span>
    </label>
  );
}
