import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-5">
      <div className="max-w-md text-center">
        <p className="mx-auto mb-3 h-1 w-8 bg-pine" aria-hidden />
        <h1 className="font-serif text-2xl">That page is not here</h1>
        <p className="mt-2 text-sm text-ink-soft">
          The record may have been removed, or the address may be wrong.
        </p>
        <Link href="/dashboard" className="mt-5 inline-block text-sm text-pine hover:underline">
          Back to the overview
        </Link>
      </div>
    </main>
  );
}
