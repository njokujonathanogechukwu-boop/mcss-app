"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import type { Neighbour } from "@/lib/neighbours";

/**
 * Steps to the record before or after this one without going back to the list:
 * the arrows in the page header, and the ← and → keys while nothing is being
 * typed into a field.
 */
export function PrevNext({ prev, next }: { prev: Neighbour; next: Neighbour }) {
  const router = useRouter();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      const to = event.key === "ArrowLeft" ? prev : event.key === "ArrowRight" ? next : null;
      if (!to) return;
      event.preventDefault();
      router.push(to.href);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prev, next, router]);

  const cls = "inline-flex items-center gap-1 rounded border border-rule bg-surface px-2.5 py-1 text-xs text-ink-soft";
  return (
    <nav aria-label="Previous and next" className="flex items-center gap-1.5">
      {prev ? (
        <Link href={prev.href} className={`${cls} hover:border-ink-faint hover:text-pine`} title={`${prev.label} (← key)`}>
          ← <span className="max-w-[12rem] truncate">{prev.label}</span>
        </Link>
      ) : (
        <span className={`${cls} opacity-40`} aria-disabled="true">← First</span>
      )}
      {next ? (
        <Link href={next.href} className={`${cls} hover:border-ink-faint hover:text-pine`} title={`${next.label} (→ key)`}>
          <span className="max-w-[12rem] truncate">{next.label}</span> →
        </Link>
      ) : (
        <span className={`${cls} opacity-40`} aria-disabled="true">Last →</span>
      )}
    </nav>
  );
}
