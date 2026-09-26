import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { StatusScreen } from "@/components/layout/status-screen";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

export default function NotFound() {
  return (
    <StatusScreen
      code="404"
      title={
        <>
          This page has <span className="accent-serif text-flux">moved on.</span>
        </>
      }
      actions={
        <>
          <ButtonLink href="/" arrow>
            Back to home
          </ButtonLink>
          <ButtonLink href="/work" variant="secondary">
            Explore our work
          </ButtonLink>
        </>
      }
    >
      The link may be old, or the page never existed. Everything else is still moving forward.
    </StatusScreen>
  );
}
