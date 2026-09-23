"use client";

import { useEffect, useState } from "react";
import { X, CheckCircle2, AlertCircle, Info } from "lucide-react";
import { subscribe, dismiss, type ToastMessage } from "@/lib/toast";

const icons = { success: CheckCircle2, danger: AlertCircle, neutral: Info };

export function ToastRegion() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => subscribe(setToasts), []);

  if (toasts.length === 0) return null;

  return (
    <div className="erp-toast-region" role="status" aria-live="polite">
      {toasts.map((t) => {
        const Icon = icons[t.tone];
        return (
          <div className="erp-toast" data-tone={t.tone} key={t.id}>
            <Icon size={17} aria-hidden="true" />
            <span className="flex-1">{t.text}</span>
            <button onClick={() => dismiss(t.id)} aria-label="Tutup notifikasi">
              <X size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
