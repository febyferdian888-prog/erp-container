import { AsyncLocalStorage } from "node:async_hooks";

const store = new AsyncLocalStorage<{ skipRowAudit: boolean }>();

// Bulk imports write one summary entry instead of a log line per row.
export function withoutRowAudit<T>(fn: () => Promise<T>): Promise<T> {
  return store.run({ skipRowAudit: true }, fn);
}

export function rowAuditSkipped() {
  return store.getStore()?.skipRowAudit === true;
}
