"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const TABS = [
  { href: "/school", label: "Schedules" },
  { href: "/school/students", label: "Students" },
  { href: "/school/publishers", label: "Publishers" },
  { href: "/school/archive", label: "Archive" },
];

/**
 * The school's own tabs. The overseer sees almost nothing else in the side nav,
 * so the four parts of the area are reached from here rather than from a menu.
 */
export function SchoolTabs() {
  const pathname = usePathname();

  return (
    <div className="mb-6 flex flex-wrap gap-1 border-b border-rule">
      {TABS.map((tab) => {
        const active = tab.href === "/school" ? pathname === "/school" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "-mb-px rounded-t border-b-2 px-3 py-2 text-sm transition-colors",
              active
                ? "border-pine font-medium text-pine-dark"
                : "border-transparent text-ink-soft hover:border-rule-strong hover:text-ink",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
