"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import type { PortfolioItem } from "@/lib/data/content";
import { WorkGrid } from "./work-grid";

function Inner({ projects }: { projects: PortfolioItem[] }) {
  const params = useSearchParams();
  return <WorkGrid projects={projects} initialFilter={params.get("type") ?? undefined} />;
}

/** Reads ?type= on the client so /work stays statically rendered. */
export function WorkFilterFromUrl({ projects }: { projects: PortfolioItem[] }) {
  return (
    <Suspense fallback={<WorkGrid projects={projects} />}>
      <Inner projects={projects} />
    </Suspense>
  );
}
