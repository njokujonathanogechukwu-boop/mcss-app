import Link from "next/link";
import type { ReactNode } from "react";
import { PrevNext } from "@/components/prev-next";
import type { Neighbour } from "@/lib/neighbours";

export function PageHeader({
  title,
  description,
  actions,
  back,
  nav,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  back?: { href: string; label: string };
  /** The previous and next record, for stepping through without the list. */
  nav?: { prev: Neighbour; next: Neighbour };
}) {
  return (
    <header className="mb-7 border-b border-rule pb-5">
      {(back || nav) && (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          {back ? (
            <Link href={back.href} className="text-xs text-ink-soft hover:text-pine hover:underline">
              ← {back.label}
            </Link>
          ) : (
            <span />
          )}
          {nav && <PrevNext prev={nav.prev} next={nav.next} />}
        </div>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-serif text-2xl leading-tight text-ink">{title}</h1>
          {description && (
            <p className="mt-1 max-w-[68ch] text-sm text-ink-soft">{description}</p>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function Section({
  title,
  description,
  actions,
  children,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mb-9">
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            {title && <h2 className="font-serif text-base text-ink">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-ink-soft">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded border border-rule bg-surface ${className}`}>{children}</div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded border border-dashed border-rule-strong bg-surface px-6 py-10 text-center">
      <p className="font-serif text-base text-ink">{title}</p>
      <p className="mx-auto mt-1.5 max-w-[46ch] text-sm text-ink-soft">{description}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "error" | "success" | "warn";
  children: ReactNode;
}) {
  const styles = {
    info: "border-rule bg-paper text-ink-soft",
    error: "border-clay/30 bg-clay-light text-clay",
    success: "border-pine/25 bg-pine-light text-pine-dark",
    warn: "border-wheat bg-wheat-light text-ink",
  }[tone];
  return (
    <div className={`mb-5 rounded border px-3.5 py-2.5 text-sm ${styles}`} role="status">
      {children}
    </div>
  );
}

export function DataTable({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded border border-rule bg-surface">
      <table className="w-full min-w-[640px] border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Th({
  children,
  align = "left",
  className = "",
}: {
  children?: ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  return (
    <th
      className={`border-b border-rule-strong bg-paper px-3 py-2 text-xs font-medium text-ink-soft
        ${align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"} ${className}`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  className = "",
  colSpan,
  title,
}: {
  children?: ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
  colSpan?: number;
  title?: string;
}) {
  return (
    <td
      colSpan={colSpan}
      title={title}
      className={`border-b border-rule px-3 py-2.5 align-middle
        ${align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"} ${className}`}
    >
      {children}
    </td>
  );
}
