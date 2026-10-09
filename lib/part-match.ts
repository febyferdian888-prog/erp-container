// Part-number reconciliation shared by the purchase-recap import and the sales forms.
// Vendors and invoices write the same part slightly differently (dashes, spacing, a
// trailing "-A" revision), so matching works on a normalised form.

export const normPart = (s: unknown) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

export function editDistance(a: string, b: string, cap = 4) {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

export type PartMatchStatus = "exact" | "normalized" | "similar" | "suggest" | "new" | "none";

export interface PartCandidate {
  partNumber: string;
  source: "so" | "master";
  label?: string;
}

export interface PartMatch {
  status: PartMatchStatus;
  canonical: string | null;
  source: "so" | "master" | null;
  suggestions: { partNumber: string; label?: string; source: "so" | "master" }[];
}

// Earlier candidates win ties, so pass invoice/SO parts before master parts:
// where the invoice already carries a corrected number, the invoice is right.
export function matchPart(part: string, candidates: PartCandidate[]): PartMatch {
  const raw = part.trim();
  if (!raw) return { status: "none", canonical: null, source: null, suggestions: [] };
  const n = normPart(raw);

  const exact = candidates.find((c) => c.partNumber.trim().toLowerCase() === raw.toLowerCase());
  if (exact) return { status: "exact", canonical: exact.partNumber.trim(), source: exact.source, suggestions: [] };

  const norm = candidates.find((c) => normPart(c.partNumber) === n);
  if (norm) return { status: "normalized", canonical: norm.partNumber.trim(), source: norm.source, suggestions: [] };

  const scored = candidates
    .map((c) => ({ c, d: editDistance(n, normPart(c.partNumber)), cn: normPart(c.partNumber) }))
    .filter((x) => x.cn.length >= 5 && n.length >= 5);

  const close = scored.filter((x) => x.d <= 1).sort((a, b) => a.d - b.d)[0];
  if (close && n.length >= 6) {
    return { status: "similar", canonical: close.c.partNumber.trim(), source: close.c.source, suggestions: [] };
  }

  const seen = new Set<string>();
  const suggestions = scored
    .filter((x) => x.d <= 3 || (n.length >= 6 && (x.cn.includes(n) || n.includes(x.cn))))
    .sort((a, b) => a.d - b.d)
    .filter((x) => (seen.has(x.cn) ? false : (seen.add(x.cn), true)))
    .slice(0, 3)
    .map((x) => ({ partNumber: x.c.partNumber.trim(), label: x.c.label, source: x.c.source }));

  return suggestions.length
    ? { status: "suggest", canonical: null, source: null, suggestions }
    : { status: "new", canonical: null, source: null, suggestions: [] };
}
