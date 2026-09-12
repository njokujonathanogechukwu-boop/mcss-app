"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { Home, ClipboardList, ClipboardCheck } from "lucide-react";

const TABS = [
  { href: "/m", label: "Home", icon: Home },
  { href: "/m/report", label: "Report", icon: ClipboardList },
  { href: "/m/records", label: "Records", icon: ClipboardCheck },
];

export function MobileTabBar() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-surface/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-md items-stretch justify-around">
        {TABS.map((tab) => {
          const active = tab.href === "/m" ? pathname === "/m" : pathname.startsWith(tab.href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={clsx(
                "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors",
                active ? "text-pine" : "text-ink-faint hover:text-ink-soft",
              )}
            >
              <Icon size={20} strokeWidth={active ? 2 : 1.6} aria-hidden />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
