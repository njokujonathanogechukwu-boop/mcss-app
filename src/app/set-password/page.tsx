import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { accountTokenUserId, verifyAccountToken } from "@/lib/account-tokens";
import { SetPasswordForm } from "./set-form";

export const dynamic = "force-dynamic";

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  const userId = token ? accountTokenUserId(token) : null;
  const user = userId
    ? await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true, active: true, passwordHash: true },
      })
    : null;
  const valid = token && user && user.active ? verifyAccountToken(token, user.passwordHash) : null;

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
            {valid
              ? "Choose the password for this account. You will be signed in straight away."
              : "The link in the email chooses the password for one account, once."}
          </p>
        </div>

        <div className="rounded border border-rule bg-surface p-6">
          {valid && user && token ? (
            <>
              <p className="mb-4 rounded border border-rule bg-paper px-3 py-2 text-sm text-ink-soft">
                <span className="font-medium text-ink">{user.name}</span>
                <span className="block text-xs">{user.email}</span>
              </p>
              <SetPasswordForm token={token} />
            </>
          ) : (
            <>
              <p className="text-sm text-clay">
                This link does not work any more. Each link works once and then expires — a signup
                link lasts seven days, a reset link one hour.
              </p>
              <div className="mt-4 flex gap-4 text-sm">
                <Link href="/forgot-password" className="text-pine hover:underline">
                  Request a new link
                </Link>
                <Link href="/login" className="text-ink-soft hover:underline">
                  Back to sign in
                </Link>
              </div>
            </>
          )}
        </div>

        <p className="mt-5 text-xs leading-relaxed text-ink-faint">
          These records are confidential. If you did not expect a link like this, tell the
          congregation secretary and ignore the email.
        </p>
      </div>
    </main>
  );
}
