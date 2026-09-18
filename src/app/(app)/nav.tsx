"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import clsx from "clsx";
import {
  LayoutDashboard, Users, UsersRound, ClipboardList, CalendarCheck,
  Building2, Gavel, Upload, Settings, Menu, X, LogOut, Award,
  ClipboardCheck, Smartphone, ListTodo, Mail, GraduationCap,
} from "lucide-react";
import type { Role } from "@prisma/client";
import { can, ROLE_LABELS, type Permission } from "@/lib/rbac";

const LINKS: { href: string; label: string; icon: typeof Users; permission: Permission }[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, permission: "publisher:read" },
  { href: "/publishers", label: "Publishers", icon: Users, permission: "publisher:read" },
  { href: "/groups", label: "Service groups", icon: UsersRound, permission: "group:read" },
  { href: "/reports", label: "Field service", icon: ClipboardList, permission: "report:read" },
  { href: "/records", label: "Records check", icon: ClipboardCheck, permission: "publisher:read" },
  { href: "/attendance", label: "Attendance", icon: CalendarCheck, permission: "attendance:read" },
  { href: "/bookings", label: "Kingdom Hall", icon: Building2, permission: "booking:read" },
  { href: "/privileges", label: "Privileges", icon: Award, permission: "privilege:read" },
  { href: "/school", label: "Midweek school", icon: GraduationCap, permission: "school:read" },
  { href: "/boe", label: "Elders' items", icon: Gavel, permission: "boe:read" },
  { href: "/tasks", label: "Tasks & announcements", icon: ListTodo, permission: "task:read" },
  { href: "/mail", label: "Email", icon: Mail, permission: "mail:send" },
  { href: "/import", label: "Import records", icon: Upload, permission: "import:run" },
  { href: "/m", label: "Phone entry", icon: Smartphone, permission: "report:read" },
  { href: "/settings", label: "Accounts", icon: Settings, permission: "user:manage" },
];

export function Nav({
  user,
  signOutAction,
}: {
  user: { name: string; role: Role };
  signOutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const links = LINKS.filter((l) => can(user.role, l.permission));

  const list = (
    <nav className="flex flex-col gap-0.5">
      {links.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
        const Icon = link.icon;
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={() => setOpen(false)}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "flex items-center gap-2.5 rounded px-2.5 py-2 text-sm transition-colors",
              active
                ? "bg-pine-light font-medium text-pine-dark"
                : "text-ink-soft hover:bg-paper hover:text-ink",
            )}
          >
            <Icon size={16} strokeWidth={1.75} aria-hidden />
            {link.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Mobile bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-rule bg-surface px-4 py-3 lg:hidden">
        <span className="font-serif text-sm">Maitama Secretary System</span>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
          className="rounded p-1.5 text-ink-soft hover:bg-paper"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {open && (
        <div className="border-b border-rule bg-surface px-4 py-3 lg:hidden">
          {list}
          <form action={signOutAction} className="mt-3 border-t border-rule pt-3">
            <button className="flex items-center gap-2 text-sm text-ink-soft hover:text-clay">
              <LogOut size={15} /> Sign out
            </button>
          </form>
        </div>
      )}

      {/* Desktop rail */}
      <aside className="hidden w-60 shrink-0 flex-col justify-between border-r border-rule bg-surface px-4 py-6 lg:flex">
        <div>
          <div className="mb-7 px-1">
            <span className="mb-2 block h-1 w-8 bg-pine" aria-hidden />
            <p className="font-serif text-sm leading-snug">
              Maitama Congregation
              <span className="block text-ink-faint">Secretary System</span>
            </p>
          </div>
          {list}
        </div>

        <div className="border-t border-rule pt-4">
          <p className="px-1 text-sm text-ink">{user.name}</p>
          <p className="px-1 text-xs text-ink-faint">{ROLE_LABELS[user.role]}</p>
          <form action={signOutAction} className="mt-2.5">
            <button className="flex items-center gap-2 rounded px-1 py-1 text-xs text-ink-soft hover:text-clay">
              <LogOut size={14} /> Sign out
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
