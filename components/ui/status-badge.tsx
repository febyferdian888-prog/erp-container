type Tone = "neutral" | "info" | "warning" | "success" | "danger";

const KEYWORD_TONE: Array<[RegExp, Tone]> = [
  [/^draft$/, "neutral"],
  [/reject|cancel|expired|overdue|void|fail/, "danger"],
  [/partial|review|revision|rework/, "warning"],
  [/accept|approve|paid|receiv|deliver|complet|closed|invoiced|passed|signed/, "success"],
  [/sent|pending|transit|submit|open|confirm/, "info"],
];

/** One tone mapping shared by every document status in the app, so a page never invents its own color scheme. */
export function statusTone(status: string): Tone {
  const s = status.toLowerCase();
  for (const [pattern, tone] of KEYWORD_TONE) if (pattern.test(s)) return tone;
  return "neutral";
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const tone = statusTone(status);
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide"
      style={{ background: `var(--status-${tone}-bg)`, color: `var(--status-${tone}-fg)` }}
    >
      {label ?? status.replace(/_/g, " ")}
    </span>
  );
}
