import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { LoginForm } from "@/app/login/login-form";
import { signInToSchool } from "./actions";

// Outside the (app) group on purpose: a sign-in page must not carry the nav rail,
// and that layout signs a visitor straight back out to /login.
export default async function SchoolLoginPage() {
  const user = await getCurrentUser();
  if (user && can(user.role, "school:read")) redirect("/school");

  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <p className="mb-2 h-1 w-10 bg-pine" aria-hidden />
          <h1 className="font-serif text-2xl leading-tight">
            Life and Ministry Meeting School
            <span className="block text-ink-soft">Maitama Congregation</span>
          </h1>
          <p className="mt-3 text-sm text-ink-soft">
            Sign in to plan the midweek meeting, assign the parts and keep the roll of the
            school&rsquo;s students.
          </p>
        </div>

        <div className="rounded border border-rule bg-surface p-6">
          <LoginForm action={signInToSchool} />
        </div>

        <p className="mt-4 text-center text-xs">
          <Link href="/forgot-password" className="text-pine hover:underline">
            Forgot your password?
          </Link>
        </p>

        <p className="mt-5 text-xs leading-relaxed text-ink-faint">
          This door opens only for the school overseer and the secretary. Everyone else signs in at
          the <Link href="/login" className="text-pine hover:underline">main sign-in page</Link>.
          Ask the secretary for an account.
        </p>
      </div>
    </main>
  );
}
