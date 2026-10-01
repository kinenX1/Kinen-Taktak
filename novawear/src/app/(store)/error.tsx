"use client";

import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui/button";

export default function StoreError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="container-x py-24">
      <p className="eyebrow mb-4">Something went wrong</p>
      <h1 className="display text-[clamp(4rem,10vw,9rem)]">The leopard tripped.</h1>
      <p className="mt-5 max-w-md text-lg text-body">We couldn&apos;t load this page. Please try again.</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Button size="lg" onClick={reset}>
          Try again
        </Button>
        <ButtonLink href="/" variant="outline" size="lg">
          Back home
        </ButtonLink>
      </div>
    </div>
  );
}
