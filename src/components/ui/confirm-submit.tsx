"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useT } from "@/i18n/client";
import { Button } from "./button";

/** Submit button that asks for a second click before a destructive action. */
export function ConfirmSubmit({ children, confirmLabel, size }: { children: React.ReactNode; confirmLabel?: string; size?: "sm" | "md" }) {
  const t = useT();
  const [armed, setArmed] = useState(false);
  const { pending } = useFormStatus();
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <Button
      type={armed ? "submit" : "button"}
      variant="danger"
      size={size}
      pending={pending}
      onClick={(e) => {
        if (!armed) {
          e.preventDefault();
          setArmed(true);
        }
      }}
      aria-live="polite"
    >
      {armed ? (confirmLabel ?? t.common.clickToConfirm) : children}
    </Button>
  );
}
