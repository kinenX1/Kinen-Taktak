import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
        <h1 className="text-[clamp(2rem,4vw,2.75rem)] font-medium leading-[1.05] tracking-[-0.04em]">{title}</h1>
        {description && <div className="mt-3 max-w-2xl leading-relaxed text-fog-400">{description}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-3">{actions}</div>}
    </header>
  );
}

export function Panel({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-line bg-ink-900/50 ${className ?? ""}`}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
          {title && <h2 className="text-sm font-medium text-fog-50">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function EmptyState({ title, children, action, icon }: { title: string; children?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      {icon && <span className="mb-5 flex size-12 items-center justify-center rounded-full border border-line text-fog-400">{icon}</span>}
      <p className="text-lg font-medium text-fog-50">{title}</p>
      {children && <div className="mt-2 max-w-sm text-sm leading-relaxed text-fog-400">{children}</div>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "success" | "warning"; children: ReactNode }) {
  const tones = {
    info: "border-ion/30 bg-ion/[0.07] text-ion-soft",
    success: "border-success/30 bg-success/[0.07] text-[#a6f0cd]",
    warning: "border-warning/30 bg-warning/[0.07] text-warning",
  };
  return (
    <div role="status" className={`mb-8 rounded-md border px-4 py-3 text-sm ${tones[tone]}`}>
      {children}
    </div>
  );
}
