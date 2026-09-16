import Link from "next/link";
import { ForgotForm } from "./forgot-form";

export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
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
            Type the email address on your account and the system will send a one-time link to
            choose a new password.
          </p>
        </div>

        <div className="rounded border border-rule bg-surface p-6">
          <ForgotForm />
        </div>

        <p className="mt-5 text-center text-xs">
          <Link href="/login" className="text-pine hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
