import { LucideIcon } from "lucide-react";

/**
 * `gradient` accepts a legacy color-name hint from older callers; every hint
 * now renders as the same brand accent dot, so this file carries one color
 * decision instead of the 15-color rainbow it used to hardcode (R-29).
 */
export function DocumentHeader({
  icon: Icon,
  eyebrow,
  title,
  gradient,
  badge,
  actions,
}: {
  icon?: LucideIcon;
  eyebrow: string;
  title: string;
  gradient?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="border-b border-[var(--border)] pb-6 mb-8">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex items-center gap-3">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--primary)]" aria-hidden />
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--neutral-400)]">{eyebrow}</p>
            <h1 className="text-[26px] font-semibold tracking-tight text-[var(--foreground)] leading-tight">{title}</h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {badge}
          {actions}
        </div>
      </div>
    </div>
  );
}

export function StatusLabel({
  label,
  tone = "slate",
}: {
  label: string;
  tone?: "slate" | "green" | "amber" | "red" | "blue";
}) {
  const dot: Record<string, string> = {
    slate: "var(--neutral-400)",
    green: "var(--status-success-fg)",
    amber: "var(--status-warning-fg)",
    red: "var(--status-danger-fg)",
    blue: "var(--status-info-fg)",
  };
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--neutral-600)] capitalize">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot[tone] }} aria-hidden />
      {label}
    </span>
  );
}

export function SectionCard({
  icon: Icon,
  title,
  accentColor,
  children,
  className = "",
  action,
}: {
  icon?: LucideIcon;
  title: string;
  accentColor?: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={`border border-[var(--border)] rounded-[var(--radius-md)] overflow-hidden ${className}`}>
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--neutral-50)] px-5 py-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--neutral-600)]">{title}</h3>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-xs text-[var(--neutral-500)]">{children}</span>;
}
