import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (await getCurrentUser()) redirect("/dashboard");
  const { next } = await searchParams;

  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <p className="mb-2 h-1 w-10 bg-pine" aria-hidden />
          <h1 className="font-serif text-2xl leading-tight">
            Maitama Congregation
            <span className="block text-ink-soft">Secretary System</span>
          </h1>
          <p className="mt-3 text-sm text-ink-soft">
            Sign in to reach publisher records, field service reports, meeting attendance and the
            hall calendar.
          </p>
        </div>

        <div className="rounded border border-rule bg-surface p-6">
          <LoginForm next={next} />
        </div>

        <p className="mt-4 text-center text-xs">
          <Link href="/forgot-password" className="text-pine hover:underline">
            Forgot your password?
          </Link>
        </p>

        <p className="mt-5 text-xs leading-relaxed text-ink-faint">
          These records are confidential. Sign out when you finish, and do not share your account.
          If you need access, ask the secretary or the coordinator to create an account for you.
        </p>
      </div>
    </main>
  );
}
