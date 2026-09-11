"use client";

import clsx from "clsx";
import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

export function Button({
  children,
  variant = "primary",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
}) {
  return (
    <button
      {...props}
      className={clsx(
        "inline-flex items-center justify-center gap-1.5 rounded font-medium transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-3.5 py-2 text-sm",
        variant === "primary" && "bg-pine text-white hover:bg-pine-dark",
        variant === "secondary" &&
          "border border-rule-strong bg-surface text-ink hover:border-ink-faint hover:bg-paper",
        variant === "ghost" && "text-ink-soft hover:bg-paper hover:text-ink",
        variant === "danger" && "border border-clay/40 bg-clay-light text-clay hover:bg-clay hover:text-white",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function SubmitButton({
  children,
  pendingLabel,
  ...props
}: React.ComponentProps<typeof Button> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} {...props}>
      {pending ? (pendingLabel ?? "Working…") : children}
    </Button>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad" | "quiet";
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-sm px-1.5 py-0.5 text-xxs font-medium",
        tone === "neutral" && "bg-paper text-ink-soft ring-1 ring-inset ring-rule",
        tone === "good" && "bg-pine-light text-pine-dark",
        tone === "warn" && "bg-wheat-light text-[#7A5E1E]",
        tone === "bad" && "bg-clay-light text-clay",
        tone === "quiet" && "text-ink-faint",
      )}
    >
      {children}
    </span>
  );
}
