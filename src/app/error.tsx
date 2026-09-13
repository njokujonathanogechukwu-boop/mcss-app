"use client";

import { Button } from "@/components/ui";

/**
 * Without this the whole tab drops to Next's built-in dead end, which offers no
 * way back. A stale JS chunk after a redeploy is enough to land here, so the
 * first thing on offer is a real reload.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <p className="font-serif text-xl text-ink">This page stopped working</p>
      <p className="mt-2 text-sm text-ink-soft">
        Reload to carry on. If it happens again, make a note of what you were doing.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button onClick={() => window.location.reload()}>Reload</Button>
        <Button variant="secondary" onClick={reset}>Try again</Button>
      </div>
      {error.digest && <p className="mt-6 text-xxs text-ink-faint">Reference: {error.digest}</p>}
    </div>
  );
}
