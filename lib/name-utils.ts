export function normName(s: string) {
  return s
    .toLowerCase()
    .replace(/[.,()'"]/g, " ")
    .replace(/\b(pt|cv|ud|tbk|toko|pd|firma)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
