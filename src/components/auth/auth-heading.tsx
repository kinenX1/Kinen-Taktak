export function AuthHeading({ eyebrow, title, children }: { eyebrow: string; title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mb-10">
      <p className="eyebrow mb-4">{eyebrow}</p>
      <h1 className="text-[clamp(2.25rem,5vw,3.25rem)] font-medium leading-[1] tracking-[-0.045em]">{title}</h1>
      {children && <div className="mt-4 leading-relaxed text-fog-400">{children}</div>}
    </div>
  );
}
