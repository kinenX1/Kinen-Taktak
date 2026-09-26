"use client";

import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Alert } from "@/components/ui/icons";

/** Inline error boundary UI for route segments. */
export function ErrorView({ error, reset, compact }: { error: Error & { digest?: string }; reset: () => void; compact?: boolean }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className={compact ? "py-16" : "container-x flex min-h-[70vh] flex-col justify-center pt-(--nav-height)"}>
      <span className="mb-8 flex size-12 items-center justify-center rounded-full border border-danger/40 text-danger">
        <Alert size={20} />
      </span>
      <h1 className="max-w-2xl text-[clamp(2rem,5vw,3.5rem)] font-medium leading-[1.02] tracking-[-0.045em]">
        Something went wrong on our side.
      </h1>
      <p className="mt-4 max-w-lg leading-relaxed text-fog-400">
        The problem has been logged. Try again — if it keeps happening, please let us know.
        {error.digest && <span className="mt-2 block font-mono text-xs text-fog-500">Error reference: {error.digest}</span>}
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Button onClick={reset} arrow>
          Try again
        </Button>
        <ButtonLink href="/" variant="secondary">
          Go to home
        </ButtonLink>
      </div>
    </div>
  );
}
