import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/rbac";
import { MobileTabBar } from "./mobile-nav";
import { ServiceWorkerRegister } from "./sw-register";

export const metadata: Metadata = {
  title: "MCSS Phone",
  description: "Submit field service reports and update records from your phone.",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "MCSS" },
};

export const viewport: Viewport = {
  themeColor: "#2f4a3c",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default async function MobileLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="min-h-dvh bg-paper">
      <ServiceWorkerRegister />
      <header className="sticky top-0 z-30 border-b border-rule bg-pine text-white">
        <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
          <Link href="/m" className="flex flex-col leading-tight">
            <span className="font-serif text-sm">Maitama Secretary</span>
            <span className="text-[11px] text-white/70">Phone entry</span>
          </Link>
          <div className="text-right leading-tight">
            <p className="text-xs font-medium">{user.name}</p>
            <p className="text-[11px] text-white/70">{ROLE_LABELS[user.role]}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 pb-24 pt-5">{children}</main>

      <MobileTabBar />
    </div>
  );
}
