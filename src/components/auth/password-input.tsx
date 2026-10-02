"use client";

import { useState, type ComponentProps } from "react";
import { Input } from "@/components/ui/field";
import { Eye, EyeOff } from "@/components/ui/icons";
import { useT } from "@/i18n/client";

export function PasswordInput(props: ComponentProps<"input">) {
  const t = useT().auth;
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={visible ? "text" : "password"} className="pr-12" />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? t.hidePassword : t.showPassword}
        aria-pressed={visible}
        className="absolute right-1.5 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-fog-400 transition-colors hover:bg-fog-50/[0.06] hover:text-fog-50"
      >
        {visible ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  );
}
