"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/** Copies a list of addresses, ready to paste into the BCC field of a mail app. */
export function CopyEmails({ emails, label }: { emails: string[]; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      disabled={!emails.length}
      onClick={async () => {
        await navigator.clipboard?.writeText(emails.join(", ")).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? "Copied ✓" : label}
    </Button>
  );
}
