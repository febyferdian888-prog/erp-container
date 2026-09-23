export type ToastTone = "neutral" | "success" | "danger";
export interface ToastMessage {
  id: number;
  tone: ToastTone;
  text: string;
}

type Listener = (toasts: ToastMessage[]) => void;

let toasts: ToastMessage[] = [];
let nextId = 1;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener(toasts);
}

function push(tone: ToastTone, text: string) {
  const id = nextId++;
  toasts = [...toasts, { id, tone, text }];
  emit();
  setTimeout(() => dismiss(id), 5000);
}

export function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function subscribe(listener: Listener) {
  listeners.add(listener);
  listener(toasts);
  return () => { listeners.delete(listener); };
}

export const toast = {
  success: (text: string) => push("success", text),
  error: (text: string) => push("danger", text),
  info: (text: string) => push("neutral", text),
};
