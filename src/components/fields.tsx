import type { ReactNode } from "react";

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
  return (
    <Wrapper label={label} name={name} hint={hint} error={error}>
      <select id={name} name={name} className="field-input" {...props}>
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

export function CheckField({
  label, name, hint, defaultChecked, ...props
}: { label: string; name: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label htmlFor={name} className="flex items-start gap-2.5 py-1.5">
      <input
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
