"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "./button";

/** Submit button that asks for a second click before a destructive action. */
export function ConfirmSubmit({ children, confirmLabel = "Click again to confirm", size }: { children: React.ReactNode; confirmLabel?: string; size?: "sm" | "md" }) {
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
      {armed ? confirmLabel : children}
    </Button>
  );
}
