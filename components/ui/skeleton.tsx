import { cn } from "@/lib/utils";

/** Placeholder shaped like the content it stands in for, shown only while that content is loading. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("erp-skeleton", className)} aria-hidden="true" />;
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="w-full" role="status" aria-label="Memuat data">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-6 border-b border-[var(--border)] px-4 py-4 last:border-0">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={c === 0 ? "h-4 w-24" : "h-4 flex-1"} />
          ))}
        </div>
      ))}
    </div>
  );
}
